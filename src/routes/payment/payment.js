const express = require("express");
const router = express.Router();

const { generateQR, initiatePayment, payViaMobile, bankCallback, checkStatus, checkBalance, transactionHistory, searchUser, walletHistory, getWalletBalance } = require("../../controllers/payment/payment");

router.post("/generate-qr", generateQR);
router.post("/initiate-payment", initiatePayment);
router.post("/pay-via-mobile", payViaMobile);
router.post("/bank-callback", bankCallback);
router.get("/check-status/:txn_id", checkStatus);
router.get("/balance/:upi_id", checkBalance);
router.get("/history/:upi_id", transactionHistory);
router.get("/search", searchUser);
router.get("/wallet-history/:upi_id", walletHistory);
router.get("/wallet-balance/:upi_id", getWalletBalance);

module.exports = router;
