const db = require("../../config/db");
const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");
function rollback(conn, res, errorCode) {
  conn.rollback(() => {
    conn.release();
    res.status(400).json({ error: errorCode });
  });
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
// exports.initiatePayment = (req, res) => {
//   const { payer_upi, payee_upi, amount, payment_mode, note } = req.body;

//   if (!payer_upi || !payee_upi || amount <= 0)
//     return res.status(400).json({ error: "INVALID_INPUT" });

//   if (payer_upi === payee_upi)
//     return res.status(400).json({ error: "INVALID_TRANSACTION" });

//   const mode = payment_mode || "UPI";
//   const txnId = "TXN_" + uuidv4().slice(0, 8);
//   const txnNote = note || null; // 👈 optional

//   db.getConnection((err, conn) => {
//     if (err) return res.status(500).json({ error: "DB_CONN_ERROR" });

//     conn.beginTransaction(err => {
//       if (err) {
//         conn.release();
//         return res.status(500).json({ error: "TXN_START_FAILED" });
//       }

//       // 1️⃣ Lock payer
//       conn.query(
//         `SELECT balance FROM users WHERE upi_id = ? FOR UPDATE`,
//         [payer_upi],
//         (err, payerRows) => {
//           if (err || payerRows.length === 0)
//             return rollback(conn, res, "PAYER_NOT_FOUND");

//           if (payerRows[0].balance < amount)
//             return rollback(conn, res, "INSUFFICIENT_BALANCE");

//           // 2️⃣ Debit payer
//           conn.query(
//             `UPDATE users SET balance = balance - ? WHERE upi_id = ?`,
//             [amount, payer_upi],
//             err => {
//               if (err) return rollback(conn, res, "DEBIT_FAILED");

//               // 3️⃣ Credit payee
//               conn.query(
//                 `UPDATE users SET balance = balance + ? WHERE upi_id = ?`,
//                 [amount, payee_upi],
//                 err => {
//                   if (err) return rollback(conn, res, "CREDIT_FAILED");

//                   // 4️⃣ Log transaction (with note)
//                   conn.query(
//                     `INSERT INTO transactions
//                     (txn_id, payer_upi, payee_upi, amount, note, payment_method, status)
//                     VALUES (?, ?, ?, ?, ?, ?, 'SUCCESS')`,
//                     [txnId, payer_upi, payee_upi, amount, txnNote, mode],
//                     err => {
//                       if (err) return rollback(conn, res, "TXN_LOG_FAILED");

//                       conn.commit(err => {
//                         if (err)
//                           return rollback(conn, res, "COMMIT_FAILED");

//                         conn.release();

//                         res.json({
//                           txn_id: txnId,
//                           status: "SUCCESS",
//                           amount,
//                           note: txnNote,
//                           payment_mode: mode,
//                           message: "Payment successful"
//                         });
//                       });
//                     }
//                   );
//                 }
//               );
//             }
//           );
//         }
//       );
//     });
//   });
// };

exports.initiatePayment = (req, res) => {
  const {
    payer_upi,
    payee_upi,
    amount,
    auto_save_amount = 0,
    payment_mode,
    note
  } = req.body;

  if (!payer_upi || !payee_upi || amount <= 0 || auto_save_amount < 0)
    return res.status(400).json({ error: "INVALID_INPUT" });

  if (payer_upi === payee_upi)
    return res.status(400).json({ error: "INVALID_TRANSACTION" });

  const totalDebit = amount + auto_save_amount;
  const mode = payment_mode || "UPI";
  const txnId = "TXN_" + Date.now() + "_" + Math.floor(Math.random() * 10000);
  const txnNote = note || null;

  db.getConnection((err, conn) => {
    if (err) return res.status(500).json({ error: "DB_CONN_ERROR" });

    conn.beginTransaction(err => {
      if (err) return rollback(conn, res, "TXN_START_FAILED");

      // 1️⃣ Lock payer
      conn.query(
        `SELECT id, balance, full_name 
         FROM users 
         WHERE upi_id = ? FOR UPDATE`,
        [payer_upi],
        (err, payerRows) => {
          if (err || payerRows.length === 0)
            return rollback(conn, res, "PAYER_NOT_FOUND");

          const payerId = payerRows[0].id;
          const payerName = payerRows[0].full_name;

          if (payerRows[0].balance < totalDebit)
            return rollback(conn, res, "INSUFFICIENT_BALANCE");

          // 2️⃣ Debit payer (amount + auto-save)
          conn.query(
            `UPDATE users SET balance = balance - ? WHERE id = ?`,
            [totalDebit, payerId],
            err => {
              if (err) return rollback(conn, res, "DEBIT_FAILED");

              // 3️⃣ Credit payee
              conn.query(
                `UPDATE users SET balance = balance + ? WHERE upi_id = ?`,
                [amount, payee_upi],
                err => {
                  if (err) return rollback(conn, res, "CREDIT_FAILED");

                  // 4️⃣ Update wallet_balance (if auto-save)
                  const updateWallet = cb => {
                    if (auto_save_amount > 0) {
                      conn.query(
                        `UPDATE users 
                         SET wallet_balance = wallet_balance + ? 
                         WHERE id = ?`,
                        [auto_save_amount, payerId],
                        err => {
                          if (err)
                            return rollback(conn, res, "WALLET_UPDATE_FAILED");
                          cb();
                        }
                      );
                    } else {
                      cb();
                    }
                  };

                  // 5️⃣ Fetch payee name
                  const fetchPayeeName = cb => {
                    conn.query(
                      `SELECT full_name FROM users WHERE upi_id = ?`,
                      [payee_upi],
                      (err, payeeRows) => {
                        if (err || payeeRows.length === 0)
                          return rollback(conn, res, "PAYEE_NOT_FOUND");
                        cb(payeeRows[0].full_name);
                      }
                    );
                  };

                  // 6️⃣ Insert transaction (ONLY ONCE)
                  const insertTransaction = payeeName => {
                    conn.query(
                      `INSERT INTO transactions
                      (txn_id, payer_upi, payer_name,
                       payee_upi, payee_name,
                       amount, notes, payment_method, status)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SUCCESS')`,
                      [
                        txnId,
                        payer_upi,
                        payerName,
                        payee_upi,
                        payeeName,
                        amount,
                        txnNote,
                        mode
                      ],
                      (err, txnResult) => {
                        if (err)
                          return rollback(
                            conn,
                            res,
                            err.sqlMessage || "TXN_LOG_FAILED"
                          );

                        const transactionId = txnResult.insertId;

                        // 7️⃣ Wallet transaction entry
                        const insertWalletTxn = cb => {
                          if (auto_save_amount > 0) {
                            conn.query(
                              `INSERT INTO wallet_transactions (t_id, amount)
                               VALUES (?, ?)`,
                              [transactionId, auto_save_amount],
                              err => {
                                if (err)
                                  return rollback(
                                    conn,
                                    res,
                                    err.sqlMessage || "WALLET_TXN_FAILED"
                                  );
                                cb();
                              }
                            );
                          } else {
                            cb();
                          }
                        };

                        // 8️⃣ Commit everything
                        insertWalletTxn(() => {
                          conn.commit(err => {
                            if (err)
                              return rollback(conn, res, "COMMIT_FAILED");

                            conn.release();
                            res.json({
                              txn_id: txnId,
                              status: "SUCCESS",
                              amount,
                              auto_save_amount,
                              total_debited: totalDebit,
                              message: "Payment successful"
                            });
                          });
                        });
                      }
                    );
                  };

                  // 🔗 Chain correctly (NO DUPLICATES)
                  updateWallet(() => {
                    fetchPayeeName(payeeName => {
                      insertTransaction(payeeName);
                    });
                  });
                }
              );
            }
          );
        }
      );
    });
  });
};


/* =====================
   PAY VIA MOBILE
===================== */
// exports.payViaMobile = (req, res) => {
//   const { payer_upi, mobile, amount } = req.body;

//   if (!payer_upi || !mobile || amount <= 0)
//     return res.status(400).json({ error: "INVALID_INPUT" });

//   db.query(
//     "SELECT upi_id FROM users WHERE phone = ?",
//     [mobile],
//     (err, result) => {
// if (err) {
//   console.error("❌ MySQL Error:", err);
//   return res.status(500).json({
//     error: "DB_ERROR",
//     mysql: {
//       code: err.code,
//       errno: err.errno,
//       message: err.sqlMessage,
//       sql: err.sql
//     }
//   });
// }

//       if (result.length === 0)
//         return res.status(404).json({ error: "MOBILE_NOT_LINKED" });

//       const payee_upi = result[0].upi_id;

//       // reuse initiatePayment properly
//       exports.initiatePayment(
//         {
//           body: {
//             payer_upi,
//             payee_upi,
//             amount,
//             payment_mode: "MOBILE"
//           }
//         },
//         res
//       );
//     }
//   );
// };

exports.payViaMobile = (req, res) => {
  const { payer_upi, mobile, amount, auto_save_amount = 0, note } = req.body;

  if (!payer_upi || !mobile || amount <= 0 || auto_save_amount < 0)
    return res.status(400).json({ error: "INVALID_INPUT" });

  db.query(
    "SELECT upi_id FROM users WHERE phone = ?",
    [mobile],
    (err, result) => {
      if (err) return res.status(500).json({ error: "DB_ERROR" });

      if (result.length === 0)
        return res.status(404).json({ error: "MOBILE_NOT_LINKED" });

      exports.initiatePayment(
        {
          body: {
            payer_upi,
            payee_upi: result[0].upi_id,
            amount,
            auto_save_amount,   // ✅ passed
            note,
            payment_mode: "MOBILE"
          }
        },
        res
      );
    }
  );
};



/* =====================
   BANK CALLBACK
===================== */
exports.bankCallback = (req, res) => {
  const { txn_id, result } = req.body;

  if (!txn_id || !result)
    return res.status(400).json({ error: "INVALID_INPUT" });

  const status = result === "SUCCESS" ? "SUCCESS" : "FAILED";

  db.query(
    `UPDATE transactions 
     SET status = ?, completed_at = NOW()
     WHERE txn_id = ?`,
    [status, txn_id],
    err => {
      if (err) return res.status(500).json({ error: "UPDATE_FAILED" });

      res.json({
        txn_id,
        status,
        message: "Transaction updated"
      });
    }
  );
};

/* =====================
   CHECK STATUS
===================== */
exports.checkStatus = (req, res) => {
  const { txn_id } = req.params;

  db.query(
    "SELECT txn_id, payer_upi, payee_upi, amount, payment_method, status FROM transactions WHERE txn_id = ?",
    [txn_id],
    (err, result) => {
      if (err) return res.status(500).json({ error: "DB_ERROR" });

      if (result.length === 0)
        return res.status(404).json({ error: "TXN_NOT_FOUND" });

      res.json(result[0]);
    }
  );
};

/* =====================
   CHECK BALANCE
===================== */
exports.checkBalance = (req, res) => {
  const { upi_id } = req.params;

  if (!upi_id)
    return res.status(400).json({ error: "INVALID_INPUT" });

  db.query(
    "SELECT upi_id, balance, status FROM users WHERE upi_id = ?",
    [upi_id],
    (err, result) => {
      if (err) {
        console.error("❌ MySQL Error:", err);
        return res.status(500).json({ error: "DB_ERROR" });
      }

      if (result.length === 0)
        return res.status(404).json({ error: "USER_NOT_FOUND" });

      res.json({
        upi_id: result[0].upi_id,
        balance: result[0].balance,
        status: result[0].status
      });
    }
  );
};

/* =====================
   SEARCH USER
   (PHONE / UPI)
===================== */
exports.searchUser = (req, res) => {
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

  db.query(sql, params, (err, result) => {
    if (err) {
      console.error("❌ MySQL Error:", err);
      return res.status(500).json({ error: "DB_ERROR" });
    }

    if (result.length === 0) {
      return res.status(404).json({
        error: "USER_NOT_FOUND"
      });
    }

    res.json({
      user: result[0]
    });
  });
};

/* =====================
   TRANSACTION HISTORY
===================== */
exports.transactionHistory = (req, res) => {
  const { upi_id } = req.params;

  if (!upi_id)
    return res.status(400).json({ error: "INVALID_INPUT" });

  db.query(
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
    [upi_id, upi_id],
    (err, result) => {
      if (err) {
        console.error("❌ MySQL Error:", err);
        return res.status(500).json({ error: "DB_ERROR" });
      }

      res.json({
        upi_id,
        total_transactions: result.length,
        transactions: result
      });
    }
  );
};

exports.walletHistory = (req, res) => {
  const { upi_id } = req.params;

  if (!upi_id)
    return res.status(400).json({ error: "INVALID_INPUT" });

  db.query(
    `
    SELECT
      t_id,
      amount,
      created_at
    FROM wallet_transactions
    WHERE upi_id = ?
    ORDER BY created_at DESC
    `,
    [upi_id],
    (err, result) => {
      if (err) {
        console.error("❌ MySQL Error:", err);
        return res.status(500).json({ error: "DB_ERROR" });
      }

      res.json({
        upi_id,
        total_wallet_transactions: result.length,
        wallet_transactions: result
      });
    }
  );
};

exports.getWalletBalance = (req, res) => {
  const { upi_id } = req.params;

  if (!upi_id)
    return res.status(400).json({ error: "INVALID_INPUT" });

  db.query(
    `
    SELECT wallet_balance
    FROM users
    WHERE upi_id = ?
    `,
    [upi_id],
    (err, result) => {
      if (err) {
        console.error("❌ MySQL Error:", err);
        return res.status(500).json({ error: "DB_ERROR" });
      }

      if (result.length === 0) {
        return res.status(404).json({ error: "USER_NOT_FOUND" });
      }

      res.json({
        upi_id,
        wallet_balance: result[0].wallet_balance
      });
    }
  );
};
