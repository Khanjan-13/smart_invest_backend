const db = require("../../config/db");
const QRCode = require("qrcode");
const { v4: uuidv4 } = require("uuid");

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
exports.initiatePayment = (req, res) => {
  const { payer_upi, payee_upi, amount, payment_mode } = req.body;

  if (!payer_upi || !payee_upi || amount <= 0)
    return res.status(400).json({ error: "INVALID_INPUT" });

  if (payer_upi === payee_upi)
    return res.status(400).json({ error: "INVALID_TRANSACTION" });

  const mode = payment_mode || "UPI"; // default

  const txnId = "TXN_" + uuidv4().slice(0, 8);

  db.query(
    `INSERT INTO transactions 
     (txn_id, payer_upi, payee_upi, amount, payment_method, status)
     VALUES (?, ?, ?, ?, ?, 'PENDING')`,
    [txnId, payer_upi, payee_upi, amount, mode],
    err => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: "DB_ERROR" });
      }

      res.json({
        txn_id: txnId,
        status: "PENDING",
        payment_mode: mode,
        message: "Awaiting bank confirmation"
      });
    }
  );
};

/* =====================
   PAY VIA MOBILE
===================== */
exports.payViaMobile = (req, res) => {
  const { payer_upi, mobile, amount } = req.body;

  if (!payer_upi || !mobile || amount <= 0)
    return res.status(400).json({ error: "INVALID_INPUT" });

  db.query(
    "SELECT upi_id FROM users WHERE mobile = ?",
    [mobile],
    (err, result) => {
      if (err) return res.status(500).json({ error: "DB_ERROR" });

      if (result.length === 0)
        return res.status(404).json({ error: "MOBILE_NOT_LINKED" });

      const payee_upi = result[0].upi_id;

      // reuse initiatePayment properly
      exports.initiatePayment(
        {
          body: {
            payer_upi,
            payee_upi,
            amount,
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
