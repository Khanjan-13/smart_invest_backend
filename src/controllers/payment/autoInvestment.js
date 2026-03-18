const axios = require("axios");
const db = require("../../config/db");

const apiKeys = [
  process.env.INDIAN_API_KEY_1,
  process.env.INDIAN_API_KEY_2,
  process.env.INDIAN_API_KEY_3,
];

exports.autoInvest = async (req, res) => {
  try {
    const { upi_id } = req.body;

    const [users] = await db.execute(
      "SELECT * FROM users WHERE upi_id = ?",
      [upi_id]
    );

    if (!users || users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const user = users[0];

    const wallet_balance = parseFloat(user.wallet_balance);
    const wallet_limit = parseFloat(user.wallet_limit);

    if (wallet_balance < wallet_limit) {
      return res.json({
        success: true,
        message: "Wallet limit not reached",
      });
    }

    const riskFactor = user.risk_factor;
    const randomKey = apiKeys[Math.floor(Math.random() * apiKeys.length)];

    const response = await axios.get(
      "https://stock.indianapi.in/mutual_funds",
      {
        headers: {
          "x-api-key": randomKey,
        },
      }
    );

    const data = response.data;

    // DEBUG: log full structure to understand exact shape
    console.log("API Response Keys:", Object.keys(data));
    console.log("Equity Data:", JSON.stringify(data["Equity"], null, 2));

    // Handle both capitalized and lowercase key
    const equityData = data["Equity"] || data["equity"];

    if (!equityData || typeof equityData !== "object") {
      return res.status(500).json({ message: "Equity data missing" });
    }

    console.log("Equity Categories:", Object.keys(equityData));
    console.log("User Risk Factor:", riskFactor);

    // Find matching category — case-insensitive + trimmed
    const matchedKey = Object.keys(equityData).find(
      (key) => key.trim().toLowerCase() === riskFactor.trim().toLowerCase()
    );

    if (!matchedKey) {
      return res.status(404).json({
        message: `No funds found for risk factor: ${riskFactor}`,
        availableCategories: Object.keys(equityData), // helpful for debugging
      });
    }

    let funds = equityData[matchedKey];

    // Handle if funds is an object instead of array (convert to array)
    if (!Array.isArray(funds)) {
      funds = Object.values(funds);
    }

    if (!funds || funds.length === 0) {
      return res.status(404).json({ message: "No funds available in category" });
    }

    console.log("Sample Fund:", JSON.stringify(funds[0], null, 2));

    // Select best fund by weighted score
    const bestFund = [...funds].sort((a, b) => {
      const score = (f) =>
        (parseFloat(f["5_year_return"]) || 0) * 0.4 +
        (parseFloat(f["3_year_return"]) || 0) * 0.3 +
        (parseFloat(f["1_year_return"]) || 0) * 0.2 +
        (parseFloat(f.star_rating) || 0) * 0.1;

      return score(b) - score(a);
    })[0];

    if (!bestFund) {
      return res.status(404).json({ message: "No suitable fund found" });
    }

    const investAmount = wallet_limit;
    const nav = parseFloat(bestFund.latest_nav || bestFund.nav || bestFund.NAV);

    if (!nav || nav <= 0) {
      console.log("Best fund object:", JSON.stringify(bestFund, null, 2));
      return res.status(500).json({ message: "Invalid NAV value" });
    }

    const units = parseFloat((investAmount / nav).toFixed(4));

    await db.execute(
      `INSERT INTO investments 
      (user_id, fund_name, category, amount, nav, units)
      VALUES (?, ?, ?, ?, ?, ?)`,
      [user.id, bestFund.fund_name, riskFactor, investAmount, nav, units]
    );

    await db.execute(
      "UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ?",
      [investAmount, user.id]
    );

    return res.json({
      success: true,
      message: "Investment successful",
      fund: bestFund.fund_name,
      amount: investAmount,
      nav,
      units,
    });

  } catch (error) {
    console.error("autoInvest error:", error.message);
    console.error(error.stack);
    return res.status(500).json({
      success: false,
      message: "Auto investment failed",
      error: error.message, // remove in production
    });
  }
};