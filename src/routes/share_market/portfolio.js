const express = require("express");
const router = express.Router();

const { getUserPortfolio } = require("../../controllers/share_market/portfolio");

router.get("/user-portfolio/:upi_id", getUserPortfolio);

module.exports = router;