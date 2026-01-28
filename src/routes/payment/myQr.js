const express = require("express");
const router = express.Router();

const { generateUserQR } = require("../../controllers/payment/myQr");

router.get("/generate-user-qr/:upi_id", generateUserQR);

module.exports = router;
