const db = require("../config/db");
const { hashPin } = require("../utils/hash.util");

// 1️⃣ Send OTP (Mock)
exports.sendOtp = (req, res) => {
  const { phone } = req.body;
  const otp = "123456"; 

  const sql = `INSERT INTO otps (phone, otp, expires_at)
               VALUES (?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE))
               ON DUPLICATE KEY UPDATE otp = ?, expires_at = DATE_ADD(NOW(), INTERVAL 5 MINUTE)`;

  db.query(sql, [phone, otp, otp], (err) => {
    if (err) return res.status(500).json({ message: "Error sending OTP",error: err.code });
    res.json({ message: "OTP sent successfully", otp }); 
  });
};

// 2️⃣ Verify OTP
exports.verifyOtp = (req, res) => { 
  const { phone, otp } = req.body;

  const sql = `SELECT * FROM otps WHERE phone = ? AND otp = ? AND expires_at > NOW()`;

  db.query(sql, [phone, otp], (err, result) => {
    if (err || !result.length) return res.status(400).json({ message: "Invalid/Expired OTP" });

    // Link or Create User
    db.query("INSERT IGNORE INTO users (phone, is_phone_verified) VALUES (?, 1)", [phone], (err2) => {
      if (err2) return res.status(500).json({ message: "User creation failed" });
      res.json({ message: "Phone verified successfully" });
    });
  });
};

// 3️⃣ Verify KYC (Links Identity to Phone)
exports.verifyKyc = (req, res) => {
  // Safety check to prevent the crash you're seeing
  if (!req.body || !req.body.mobile_no) {
    return res.status(400).json({ message: "Request body or mobile_no is missing" });
  }
  const { mobile_no, aadhaar_no, pan_no } = req.body;

  // Step 1: Validate Aadhaar/PAN exists in the master records
  const findSql = `SELECT id, full_name, dob FROM user_kyc WHERE aadhaar_no = ? AND pan_no = ?`;

  db.query(findSql, [aadhaar_no, pan_no], (err, rows) => {
    if (err || rows.length === 0) {
      return res.status(400).json({ message: "Aadhaar and PAN details do not match" });
    }

    const kyc = rows[0];

    // Step 2: Update the record to "Verified" and link the current user's mobile
    const updateSql = `UPDATE user_kyc SET aadhaar_verified = 1, pan_verified = 1, mobile_no = ? WHERE id = ?`;

    db.query(updateSql, [mobile_no, kyc.id], (err2) => {
      if (err2) return res.status(500).json({ message: "KYC update failed" });
      res.json({ message: "KYC verified successfully", full_name: kyc.full_name });
    });
  });
};

// 4️⃣ Verify Bank Account (Checks KYC first)
exports.verifyBankAccount = (req, res) => {
  const { mobile_no, bank_name } = req.body;

  // 1. Fetch bank account + account holder name
  const bankSql = `
    SELECT account_holder_name, debit_card
    FROM bank_accounts
    WHERE mobile_no = ? AND bank_name = ?
  `;

  db.query(bankSql, [mobile_no, bank_name], (err, bankRows) => {
    if (err) {
      return res.status(500).json({ message: "Database error during bank lookup" });
    }

    if (bankRows.length === 0) {
      return res.status(404).json({
        message: "This mobile number is not linked to the selected bank."
      });
    }

    const accountHolderName = bankRows[0].account_holder_name;
    const debitCard = bankRows[0].debit_card;

    // 2. Check KYC verification
    const kycSql = `
      SELECT id
      FROM user_kyc
      WHERE mobile_no = ?
        AND aadhaar_verified = 1
        AND pan_verified = 1
    `;

    db.query(kycSql, [mobile_no], (err2, kycRows) => {
      if (err2) {
        return res.status(500).json({ message: "Database error during KYC check" });
      }

      if (kycRows.length === 0) {
        return res.status(403).json({
          message: "KYC not verified. Please complete Aadhaar and PAN verification."
        });
      }

      // 3. Mark bank account as verified
      const verifyBankSql = `
        UPDATE bank_accounts
        SET is_verified = 1
        WHERE mobile_no = ? AND bank_name = ?
      `;

      db.query(verifyBankSql, [mobile_no, bank_name], (err3) => {
        if (err3) {
          return res.status(500).json({ message: "Failed to verify bank account" });
        }

        // 4. Generate UPI ID
        const formattedName = accountHolderName
          .toLowerCase()
          .replace(/[^a-z\s]/g, '')   // remove special chars
          .trim()
          .replace(/\s+/g, '.');      // spaces → dots

        const formattedBank = bank_name
          .toLowerCase()
          .replace(/\s+/g, '')
          .replace(/[^a-z]/g, '');

        const upiId = `${formattedName}@${formattedBank}`;

        // 5. Update users table
        const updateUserSql = `
          UPDATE users
          SET full_name = ?, upi_id = ?
          WHERE phone = ?
        `;

        db.query(
          updateUserSql,
          [accountHolderName, upiId, mobile_no],
          (err4) => {
            if (err4) {
              return res.status(500).json({
                message: "Failed to update user profile"
              });
            }

            return res.json({
              message: `Bank account at ${bank_name} verified successfully`,
              full_name: accountHolderName,
              upi_id: upiId,
                debit_card: debitCard
            });
          }
        );
      });
    });
  });
};




// 5️⃣ Set Security PIN
exports.setSecurityPin = async (req, res) => {
  const { phone, pin } = req.body;
  try {
    const hashedPin = await hashPin(pin);
    db.query(`UPDATE users SET security_pin=? WHERE phone=?`, [hashedPin, phone], () => {
      res.json({ message: "Security PIN set successfully" });
    });
  } catch (e) {
    res.status(500).json({ message: "Hash failed" });
  }
};

// 6️⃣ Set UPI PIN
exports.setUpiPin = async (req, res) => {
  const { phone, upiPin } = req.body; // Changed from userId to phone for consistency
  const hashedUpiPin = await hashPin(upiPin);

  const sql = `INSERT INTO upi_pins (user_id, upi_pin) 
               SELECT id, ? FROM users WHERE phone = ?`;

  db.query(sql, [hashedUpiPin, phone], (err) => { 
    if (err) return res.status(500).json({ message: "UPI PIN set failed" });
    res.json({ message: "UPI PIN set successfully" });
  });
};