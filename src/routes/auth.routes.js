const express = require("express");
const router = express.Router();

const {
  sendOtp,
  verifyOtp,
  setSecurityPin,
  setUpiPin,
  verifyKyc,
  verifyBankAccount
} = require("../controllers/auth.controller");

router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);
router.post("/set-security-pin", setSecurityPin);
router.post("/set-upi-pin", setUpiPin);
router.post("/verify-kyc", verifyKyc);
router.post("/verify-bank-account", verifyBankAccount);

module.exports = router;
