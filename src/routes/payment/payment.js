const express = require("express");
const router = express.Router();

const { generateQR, initiatePayment, payViaMobile, bankCallback, checkStatus } = require("../../controllers/payment/payment");

router.post("/generate-qr", generateQR);
router.post("/initiate-payment", initiatePayment);
router.post("/pay-via-mobile", payViaMobile);
router.post("/bank-callback", bankCallback);
router.get("/check-status/:txn_id", checkStatus);

module.exports = router;
