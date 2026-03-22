const db = require("../../config/db");
const QRCode = require("qrcode");
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");

async function rollback(conn, res, errorCode) {
  try {
    await conn.rollback();
  } catch (err) {
    console.error("Rollback error:", err);
  } finally {
    conn.release();
    if (res && !res.headersSent) {
      res.status(400).json({ error: errorCode });
    }
  }
}
 
/* =====================
   GENERATE QR (DYNAMIC)
===================== */
exports.generateQR = async (req, res) => {
  const { upi_id, amount, note } = req.body;

  if (!upi_id || amount <= 0)
    return res.status(400).json({ error: "INVALID_INPUT" });

  const qrString = `upi://pay?pa=${upi_id}&am=${amount}&cu=INR&tn=${note || ""}`;

  try {
    const qrImage = await QRCode.toDataURL(qrString);
    res.json({
      qr_string: qrString,
      qr_image: qrImage,
      payment_mode: "QR"
    });
  } catch (err) {
    res.status(500).json({ error: "QR_GENERATION_FAILED" });
  }
};

/* =====================
   INITIATE PAYMENT
   (QR / UPI)
===================== */
exports.initiatePayment = async (req, res) => {
  const {
    payer_upi,
    payee_upi,
    amount,
    auto_save_amount = 0,
    payment_mode,
    note,
    upi_pin // 🔐 NEW
  } = req.body;

  if (!payer_upi || !payee_upi || !upi_pin || amount <= 0 || auto_save_amount < 0)
    return res.status(400).json({ error: "INVALID_INPUT" });

  if (payer_upi === payee_upi)
    return res.status(400).json({ error: "INVALID_TRANSACTION" });

  const totalDebit = amount + auto_save_amount;
  const mode = payment_mode || "UPI";
  const txnId = "TXN_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
  const txnNote = note || null;

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    // 1️⃣ Lock payer
    const [payerRows] = await conn.query(
      `SELECT id, balance, full_name 
       FROM users 
       WHERE upi_id = ? FOR UPDATE`,
      [payer_upi]
    );

    if (payerRows.length === 0)
      return rollback(conn, res, "PAYER_NOT_FOUND");

    const payerId = payerRows[0].id;
    const payerName = payerRows[0].full_name;

    // 🔐 1.1 Fetch & verify UPI PIN
    const [pinRows] = await conn.query(
      `SELECT upi_pin FROM upi_pins WHERE user_id = ?`,
      [payerId]
    );

    if (pinRows.length === 0)
      return rollback(conn, res, "UPI_PIN_NOT_SET");

    const isPinValid = await bcrypt.compare(upi_pin, pinRows[0].upi_pin);
    if (!isPinValid)
      return rollback(conn, res, "INVALID_UPI_PIN");

    // 2️⃣ Check balance
    if (payerRows[0].balance < totalDebit)
      return rollback(conn, res, "INSUFFICIENT_BALANCE");

    // 3️⃣ Debit payer
    const [debitResult] = await conn.query(
      `UPDATE users SET balance = balance - ? WHERE id = ?`,
      [totalDebit, payerId]
    );
    if (debitResult.affectedRows === 0) return rollback(conn, res, "DEBIT_FAILED");

    // 4️⃣ Credit payee
    const [creditResult] = await conn.query(
      `UPDATE users SET balance = balance + ? WHERE upi_id = ?`,
      [amount, payee_upi]
    );
    if (creditResult.affectedRows === 0) return rollback(conn, res, "CREDIT_FAILED");

    // 5️⃣ Auto-save wallet
    if (auto_save_amount > 0) {
      const [walletResult] = await conn.query(
        `UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ?`,
        [auto_save_amount, payerId]
      );
      if (walletResult.affectedRows === 0) return rollback(conn, res, "WALLET_UPDATE_FAILED");
    }

    // 6️⃣ Fetch payee name
    const [payeeRows] = await conn.query(
      `SELECT full_name FROM users WHERE upi_id = ?`,
      [payee_upi]
    );
    if (payeeRows.length === 0)
      return rollback(conn, res, "PAYEE_NOT_FOUND");
    const payeeName = payeeRows[0].full_name;

    // 7️⃣ Insert transaction
    const [txnResult] = await conn.query(
      `INSERT INTO transactions
      (txn_id, payer_upi, payer_name,
       payee_upi, payee_name,
       amount, notes, payment_method, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SUCCESS')`,
      [txnId, payer_upi, payerName, payee_upi, payeeName, amount, txnNote, mode]
    );
    const transactionId = txnResult.insertId;

    // 8️⃣ Wallet transaction
    if (auto_save_amount > 0) {
      await conn.query(
        `INSERT INTO wallet_transactions (t_id, amount) VALUES (?, ?)`,
        [transactionId, auto_save_amount]
      );
    }

    // 9️⃣ Commit
    await conn.commit();
    conn.release();

    res.json({
      txn_id: txnId,
      status: "SUCCESS",
      amount,
      auto_save_amount,
      total_debited: totalDebit,
      message: "Payment successful"
    });

  } catch (err) {
    if (conn) {
      console.error("❌ Transaction Error:", err);
      return rollback(conn, res, "TXN_FAILED");
    }
    console.error("❌ DB Conn Error:", err);
    res.status(500).json({ error: "DB_CONN_ERROR" });
  }
};

/* =====================
   PAY VIA MOBILE
===================== */
exports.payViaMobile = async (req, res) => {
  const {
    payer_upi,
    mobile,
    amount,
    auto_save_amount = 0,
    note,
    upi_pin // 🔐 REQUIRED
  } = req.body;

  if (!payer_upi || !mobile || !upi_pin || amount <= 0 || auto_save_amount < 0)
    return res.status(400).json({ error: "INVALID_INPUT" });

  try {
    const [result] = await db.query(
      `SELECT upi_id FROM users WHERE phone = ?`,
      [mobile]
    );

    if (result.length === 0)
      return res.status(404).json({ error: "MOBILE_NOT_LINKED" });

    const payee_upi = result[0].upi_id;

    // 🚫 Prevent self payment
    if (payer_upi === payee_upi)
      return res.status(400).json({ error: "INVALID_TRANSACTION" });

    // ✅ Forward EVERYTHING to initiatePayment
    exports.initiatePayment(
      {
        body: {
          payer_upi,
          payee_upi,
          amount,
          auto_save_amount,
          note,
          upi_pin,               // 🔐 PASSED
          payment_mode: "MOBILE"
        }
      },
      res
    );
  } catch (err) {
    console.error("❌ MySQL Error:", err);
    res.status(500).json({ error: "DB_ERROR" });
  }
};

/* =====================
   BANK CALLBACK
===================== */
exports.bankCallback = async (req, res) => {
  const { txn_id, result } = req.body;

  if (!txn_id || !result)
    return res.status(400).json({ error: "INVALID_INPUT" });

  const status = result === "SUCCESS" ? "SUCCESS" : "FAILED";

  try {
    await db.query(
      `UPDATE transactions 
       SET status = ?, completed_at = NOW()
       WHERE txn_id = ?`,
      [status, txn_id]
    );
    res.json({
      txn_id,
      status,
      message: "Transaction updated"
    });
  } catch (err) {
    console.error("❌ MySQL Error:", err);
    res.status(500).json({ error: "UPDATE_FAILED" });
  }
};

/* =====================
   CHECK STATUS
===================== */
exports.checkStatus = async (req, res) => {
  const { txn_id } = req.params;

  try {
    const [result] = await db.query(
      "SELECT txn_id, payer_upi, payee_upi, amount, payment_method, status FROM transactions WHERE txn_id = ?",
      [txn_id]
    );

    if (result.length === 0)
      return res.status(404).json({ error: "TXN_NOT_FOUND" });

    res.json(result[0]);
  } catch (err) {
    console.error("❌ MySQL Error:", err);
    res.status(500).json({ error: "DB_ERROR" });
  }
};

/* =====================
   CHECK BALANCE
===================== */
exports.checkBalance = async (req, res) => {
  const { upi_id } = req.params;

  if (!upi_id)
    return res.status(400).json({ error: "INVALID_INPUT" });

  try {
    const [result] = await db.query(
      "SELECT upi_id, balance, status FROM users WHERE upi_id = ?",
      [upi_id]
    );

    if (result.length === 0)
      return res.status(404).json({ error: "USER_NOT_FOUND" });

    res.json({
      upi_id: result[0].upi_id,
      balance: result[0].balance,
      status: result[0].status
    });
  } catch (err) {
    console.error("❌ MySQL Error:", err);
    res.status(500).json({ error: "DB_ERROR" });
  }
};

/* =====================
   SEARCH USER
   (PHONE / UPI)
===================== */
exports.searchUser = async (req, res) => {
  const { phone, upi_id } = req.query;

  if (!phone && !upi_id) {
    return res.status(400).json({
      error: "PHONE_OR_UPI_REQUIRED"
    });
  }

  let sql = `
    SELECT 
      upi_id,
      full_name,
      phone
    FROM users
    WHERE
  `;

  let params = [];

  if (phone) {
    sql += " phone = ? ";
    params.push(phone);
  } else {
    sql += " upi_id = ? ";
    params.push(upi_id);
  }

  try {
    const [result] = await db.query(sql, params);

    if (result.length === 0) {
      return res.status(404).json({
        error: "USER_NOT_FOUND"
      });
    }

    res.json({
      user: result[0]
    });
  } catch (err) {
    console.error("❌ MySQL Error:", err);
    res.status(500).json({ error: "DB_ERROR" });
  }
};

/* =====================
   TRANSACTION HISTORY
===================== */
exports.transactionHistory = async (req, res) => {
  const { upi_id } = req.params;

  if (!upi_id)
    return res.status(400).json({ error: "INVALID_INPUT" });

  try {
    const [result] = await db.query(
      `
      SELECT 
        txn_id,
        payer_upi,
        payee_upi,
        amount,
        payment_method,
        status,
        created_at
      FROM transactions
      WHERE payer_upi = ? OR payee_upi = ?
      ORDER BY created_at DESC
      `,
      [upi_id, upi_id]
    );

    res.json({
      upi_id,
      total_transactions: result.length,
      transactions: result
    });
  } catch (err) {
    console.error("❌ MySQL Error:", err);
    res.status(500).json({ error: "DB_ERROR" });
  }
};

/* =====================
   WALLET HISTORY
===================== */
exports.walletHistory = async (req, res) => {
  const { upi_id } = req.params;

  if (!upi_id) {
    return res.status(400).json({ error: "INVALID_INPUT" });
  }

  try {
    const [result] = await db.query(
      `
      SELECT
        wt.t_id,
        wt.amount AS wallet_amount,
        wt.created_at,

        t.txn_id,
        t.payer_upi,
        t.payee_upi,
        t.payer_name,
        t.payee_name,
        t.payment_method,
        t.status,

        CASE
          WHEN t.payee_upi = ? THEN 'CREDIT'
          ELSE 'DEBIT'
        END AS transaction_type

      FROM wallet_transactions wt
      INNER JOIN transactions t ON wt.t_id = t.id
      WHERE t.payer_upi = ? OR t.payee_upi = ?
      ORDER BY wt.created_at DESC
      `,
      [upi_id, upi_id, upi_id]
    );

    res.json({
      upi_id,
      total_wallet_transactions: result.length,
      wallet_transactions: result
    });
  } catch (err) {
    console.error("❌ MySQL Error:", err);
    res.status(500).json({ error: "DB_ERROR" });
  }
};

/* =====================
   GET WALLET BALANCE
===================== */
exports.getWalletBalance = async (req, res) => {
  try {
    console.log("API HIT");

    const { upi_id } = req.params;

    if (!upi_id) {
      return res.status(400).json({ error: "INVALID_INPUT" });
    }

    const [result] = await db.query(
      `SELECT wallet_balance FROM users WHERE upi_id = ?`,
      [upi_id]
    );

    if (result.length === 0) {
      return res.status(404).json({ error: "USER_NOT_FOUND" });
    }

    res.json({
      upi_id,
      wallet_balance: result[0].wallet_balance,
    });

  } catch (err) {
    console.error("❌ MySQL Error:", err);
    res.status(500).json({ error: "DB_ERROR" });
  }
};

exports.getTransactionByTxnId = async (req, res) => {
  const { txn_id } = req.params;

  if (!txn_id)
    return res.status(400).json({ error: "TXN_ID_REQUIRED" });

  const query = `
    SELECT 
      t.id,
      t.txn_id,
      t.payer_upi,
      t.payer_name,
      t.payee_upi,
      t.payee_name,
      t.amount,
      t.payment_method,
      t.status,
      t.notes,
      t.created_at,
      t.completed_at,
      wt.amount AS auto_save_amount
    FROM transactions t
    LEFT JOIN wallet_transactions wt 
      ON wt.t_id = t.id
    WHERE t.txn_id = ?
    LIMIT 1
  `;

  try {
    const [rows] = await db.query(query, [txn_id]);

    if (rows.length === 0)
      return res.status(404).json({ error: "TRANSACTION_NOT_FOUND" });

    const tx = rows[0];

    res.json({
      txn_id: tx.txn_id,
      status: tx.status,
      payer: {
        upi: tx.payer_upi,
        name: tx.payer_name
      },
      payee: {
        upi: tx.payee_upi,
        name: tx.payee_name
      },
      amount: tx.amount,
      payment_method: tx.payment_method,
      notes: tx.notes,
      auto_save_amount: tx.auto_save_amount || 0,
      wallet_deducted: !!tx.auto_save_amount,
      created_at: tx.created_at,
      completed_at: tx.completed_at
    });
  } catch (err) {
    console.error("❌ MySQL Error:", err);
    res.status(500).json({ error: "DB_ERROR" });
  }
};
