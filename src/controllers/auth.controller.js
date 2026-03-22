const db = require("../config/db");
const { hashPin } = require("../utils/hash.util");

// 1️⃣ Send OTP (Mock)
exports.sendOtp = async (req, res) => {
  const { phone } = req.body;
  const otp = "123456"; 

  const sql = `INSERT INTO otps (phone, otp, expires_at)
               VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))
               ON DUPLICATE KEY UPDATE otp = ?, expires_at = DATE_ADD(NOW(), INTERVAL 5 MINUTE)`;

  try {
    await db.query(sql, [phone, otp, otp]);
    res.json({ message: "OTP sent successfully", otp }); 
  } catch (err) {
    res.status(500).json({ message: "Error sending OTP", error: err.code });
  }
};

// 2️⃣ Verify OTP
exports.verifyOtp = async (req, res) => { 
  const { phone, otp } = req.body;

  const sql = `SELECT * FROM otps WHERE phone = ? AND otp = ? AND expires_at > NOW()`;

  try {
    const [result] = await db.query(sql, [phone, otp]);
    if (!result.length) return res.status(400).json({ message: "Invalid/Expired OTP" });

    // Link or Create User
    await db.query("INSERT IGNORE INTO users (phone, is_phone_verified) VALUES (?, 1)", [phone]);
    res.json({ message: "Phone verified successfully" });
  } catch (err) {
    res.status(500).json({ message: "User creation or OTP verification failed" });
  }
};

// 3️⃣ Verify KYC (Links Identity to Phone)
exports.verifyKyc = async (req, res) => {
  if (!req.body || !req.body.mobile_no) {
    return res.status(400).json({ message: "Request body or mobile_no is missing" });
  }
  const { mobile_no, aadhaar_no, pan_no } = req.body;

  const findSql = `SELECT id, full_name, dob FROM user_kyc WHERE aadhaar_no = ? AND pan_no = ?`;

  try {
    const [rows] = await db.query(findSql, [aadhaar_no, pan_no]);
    if (rows.length === 0) {
      return res.status(400).json({ message: "Aadhaar and PAN details do not match" });
    }

    const kyc = rows[0];

    const updateSql = `UPDATE user_kyc SET aadhaar_verified = 1, pan_verified = 1, mobile_no = ? WHERE id = ?`;
    await db.query(updateSql, [mobile_no, kyc.id]);

    res.json({ message: "KYC verified successfully", full_name: kyc.full_name });
  } catch (err) {
    res.status(500).json({ message: "KYC update or verification failed" });
  }
};

// 4️⃣ Verify Bank Account (Checks KYC first)
exports.verifyBankAccount = async (req, res) => {
  const { mobile_no, bank_name } = req.body;

  const bankSql = `
    SELECT account_holder_name, debit_card
    FROM bank_accounts
    WHERE mobile_no = ? AND bank_name = ?
  `;

  try {
    const [bankRows] = await db.query(bankSql, [mobile_no, bank_name]);
    if (bankRows.length === 0) {
      return res.status(404).json({
        message: "This mobile number is not linked to the selected bank."
      });
    }

    const accountHolderName = bankRows[0].account_holder_name;
    const debitCard = bankRows[0].debit_card;

    const kycSql = `
      SELECT id
      FROM user_kyc
      WHERE mobile_no = ?
        AND aadhaar_verified = 1
        AND pan_verified = 1
    `;

    const [kycRows] = await db.query(kycSql, [mobile_no]);
    if (kycRows.length === 0) {
      return res.status(403).json({
        message: "KYC not verified. Please complete Aadhaar and PAN verification."
      });
    }

    const verifyBankSql = `
      UPDATE bank_accounts
      SET is_verified = 1
      WHERE mobile_no = ? AND bank_name = ?
    `;

    await db.query(verifyBankSql, [mobile_no, bank_name]);

    const formattedName = accountHolderName
      .toLowerCase()
      .replace(/[^a-z\s]/g, '')
      .trim()
      .replace(/\s+/g, '.');

    const formattedBank = bank_name
      .toLowerCase()
      .replace(/\s+/g, '')
      .replace(/[^a-z]/g, '');

    const upiId = `${formattedName}@${formattedBank}`;

    const updateUserSql = `
      UPDATE users
      SET full_name = ?, upi_id = ?
      WHERE phone = ?
    `;

    await db.query(updateUserSql, [accountHolderName, upiId, mobile_no]);

    return res.json({
      message: `Bank account at ${bank_name} verified successfully`,
      full_name: accountHolderName,
      upi_id: upiId,
      debit_card: debitCard
    });

  } catch (err) {
    return res.status(500).json({ message: "Database error during bank verification" });
  }
};

// 5️⃣ Set Security PIN
exports.setSecurityPin = async (req, res) => {
  const { phone, pin } = req.body;
  try {
    const hashedPin = await hashPin(pin);
    await db.query(`UPDATE users SET security_pin=? WHERE phone=?`, [hashedPin, phone]);
    res.json({ message: "Security PIN set successfully" });
  } catch (e) {
    res.status(500).json({ message: "Set Security PIN failed", error: e.message });
  }
};

// 6️⃣ Set UPI PIN
exports.setUpiPin = async (req, res) => {
  const { phone, upiPin } = req.body; 
  try {
    const hashedUpiPin = await hashPin(upiPin);
    const sql = `INSERT INTO upi_pins (user_id, upi_pin) 
                 SELECT id, ? FROM users WHERE phone = ?`;

    await db.query(sql, [hashedUpiPin, phone]);
    res.json({ message: "UPI PIN set successfully" });
  } catch (err) {
    res.status(500).json({ message: "UPI PIN set failed", error: err.message });
  }
};