const db = require("../../config/db");

// 🔹 Helper functions
const getRandom = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const generateAadhaar = () => {
  return Array.from({ length: 12 }, () => getRandom(0, 9)).join("");
};

const generatePAN = (name) => {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return (
    letters[getRandom(0, 25)] +
    letters[getRandom(0, 25)] +
    letters[getRandom(0, 25)] +
    letters[getRandom(0, 25)] +
    letters[getRandom(0, 25)] +
    getRandom(0, 9) +
    letters[getRandom(0, 25)] +
    letters[getRandom(0, 25)] +
    letters[getRandom(0, 25)] +
    letters[getRandom(0, 25)]
  );
};

const generateIFSC = () => {
  const banks = ["HDFC", "State Bank of India", "ICICI Bank Ltd.", "Bank of Baroda"];
  const bank = banks[getRandom(0, banks.length - 1)];
  return bank + "0" + getRandom(100000, 999999);
};

const generateAccountNumber = () => {
  return getRandom(100000000000, 999999999999).toString();
};

const generateDebitCard = () => {
  return getRandom(1000000000000000, 9999999999999999).toString();
};

const generateDOB = () => {
  const year = getRandom(1985, 2005);
  const month = getRandom(1, 12);
  const day = getRandom(1, 28);
  return `${year}-${month}-${day}`;
};

// 🔹 MAIN CONTROLLER
exports.createUserFull = async (req, res) => {
  try {
    const { first_name, last_name, mobile_no } = req.body;

    if (!first_name || !last_name || !mobile_no) {
      return res.status(400).json({ message: "All fields required" });
    }

    const full_name = `${first_name} ${last_name}`;

    // 🔹 Check existing user
    const [existingUser] = await db.query(
      "SELECT * FROM users WHERE phone = ?",
      [mobile_no]
    );

    if (existingUser.length > 0) {
      return res.status(400).json({ message: "User already exists" });
    }

    // 🔹 Generate UPI ID (handle duplicates)
    let baseUpi = `${first_name}.${last_name}`.toLowerCase();
    let bank = "hdfc";
    let upi_id = `${baseUpi}@${bank}`;

    let counter = 1;

    while (true) {
      const [upiCheck] = await db.query(
        "SELECT * FROM users WHERE upi_id = ?",
        [upi_id]
      );

      if (upiCheck.length === 0) break;

      upi_id = `${baseUpi}${counter}@${bank}`;
      counter++;
    }

    // 🔹 Random security pin
    const security_pin = null;

    // 🔹 Insert into USERS
    await db.query(
      `INSERT INTO users 
      (phone, security_pin, is_phone_verified, full_name, upi_id, balance, wallet_balance, status, wallet_limit, risk_factor) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mobile_no,
        security_pin,
        1,
        full_name,
        upi_id,
        0,
        0,
        "active",
        100,
        "Flexi Cap",
      ]
    );

    // 🔹 Insert into USER_KYC
    const aadhaar_no = generateAadhaar();
    const pan_no = generatePAN(full_name);

    await db.query(
      `INSERT INTO user_kyc
      (mobile_no, full_name, dob, gender, address, aadhaar_no, pan_no, aadhaar_verified, pan_verified)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        mobile_no,
        full_name,
        generateDOB(),
        Math.random() > 0.5 ? "Male" : "Female",
        "India",
        aadhaar_no,
        pan_no,
        1,
        1,
      ]
    );

    // 🔹 Insert into BANK ACCOUNTS
    const bank_name = "HDFC Bank";

    await db.query(
      `INSERT INTO bank_accounts
      (mobile_no, account_holder_name, bank_name, account_number, ifsc_code, is_verified, debit_card)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        mobile_no,
        full_name,
        bank_name,
        generateAccountNumber(),
        generateIFSC(),
        1,
        generateDebitCard(),
      ]
    );

    res.status(201).json({
      success: true,
      message: "User ecosystem created successfully",
      data: {
        full_name,
        mobile_no,
        upi_id,
        bank_name,
        aadhaar_no,
        pan_no,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// 🔹 UPDATE USER STATUS (ACTIVATE / DEACTIVATE)
exports.updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const allowed = ["active", "inactive"];
    if (!allowed.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "status must be 'active' or 'inactive'",
      });
    }

    const [result] = await db.query(
      "UPDATE users SET status = ? WHERE id = ?",
      [status, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    res.json({ success: true, id: Number(id), status });
  } catch (err) {
    console.error("updateUserStatus error:", err);
    res.status(500).json({ success: false, message: "Failed to update status" });
  }
};

// 🔹 GET ALL USERS DETAILS (ADMIN)
exports.getAllUsersDetails = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT
        u.id,
        u.full_name,
        u.phone AS mobile_no,
        u.upi_id,
        u.wallet_limit,
        u.risk_factor,
        u.balance,
        u.wallet_balance,
        u.status,
        u.created_at,

        k.aadhaar_no,
        k.pan_no,

        b.bank_name

      FROM users u
      LEFT JOIN user_kyc k ON u.phone = k.mobile_no
      LEFT JOIN bank_accounts b ON u.phone = b.mobile_no

      ORDER BY u.created_at DESC`
    );

    res.json({
      success: true,
      count: rows.length,
      data: rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Error fetching users" });
  }
};