const express = require("express");
const router = express.Router();

const { autoInvest } = require("../../controllers/payment/autoInvestment");

router.post("/auto-invest", autoInvest);

module.exports = router;
