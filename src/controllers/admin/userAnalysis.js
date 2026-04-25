const db = require("../../config/db");

// 📊 USER SPENDING ANALYSIS
exports.getUserSpendingAnalysis = async (req, res) => {
  try {
    const { user_id } = req.params;

    // 🔹 Total Spending
    const [total] = await db.query(
      `SELECT SUM(amount) as total_spent 
       FROM transactions 
       WHERE payer_upi IN (SELECT upi_id FROM users WHERE id = ?) 
       AND status = 'SUCCESS'`,
      [user_id]
    );

    // 🔹 Spending by Date
    const [daily] = await db.query(
      `SELECT DATE(created_at) as date, SUM(amount) as total
       FROM transactions
       WHERE payer_upi IN (SELECT upi_id FROM users WHERE id = ?)
       AND status = 'SUCCESS'
       GROUP BY DATE(created_at)
       ORDER BY date DESC`,
      [user_id]
    );

    // 🔹 Spending by Notes (Category Insight)
    const [notes] = await db.query(
      `SELECT notes, SUM(amount) as total
       FROM transactions
       WHERE payer_upi IN (SELECT upi_id FROM users WHERE id = ?)
       AND status = 'SUCCESS'
       GROUP BY notes
       ORDER BY total DESC`,
      [user_id]
    );

    res.json({
      success: true,
      total_spent: total[0].total_spent || 0,
      daily_spending: daily,
      spending_by_notes: notes,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching spending analysis" });
  }
};

exports.getMonthlySpending = async (req, res) => {
  try {
    const { user_id } = req.params;

    const [data] = await db.query(
      `SELECT DATE_FORMAT(created_at, '%Y-%m') as month,
              SUM(amount) as total
       FROM transactions
       WHERE payer_upi IN (SELECT upi_id FROM users WHERE id = ?)
       AND status = 'SUCCESS'
       GROUP BY month
       ORDER BY month ASC`,
      [user_id]
    );

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ message: "Error fetching monthly data" });
  }
};

exports.getInvestmentAnalysis = async (req, res) => {
  try {
    const { user_id } = req.params;

    // 🔹 Total Invested
    const [total] = await db.query(
      `SELECT SUM(amount) as total_invested 
       FROM investments 
       WHERE user_id = ?`,
      [user_id]
    );

    // 🔹 Fund-wise distribution
    const [funds] = await db.query(
      `SELECT fund_name, SUM(amount) as total
       FROM investments
       WHERE user_id = ?
       GROUP BY fund_name
       ORDER BY total DESC`,
      [user_id]
    );

    // 🔹 Category-wise
    const [category] = await db.query(
      `SELECT category, SUM(amount) as total
       FROM investments
       WHERE user_id = ?
       GROUP BY category`,
      [user_id]
    );

    res.json({
      success: true,
      total_invested: total[0].total_invested || 0,
      fund_distribution: funds,
      category_distribution: category,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Investment analysis error" });
  }
};

// BUY = `investments` rows; SELL = `investment_transactions` rows (logged when an
// investment is soft-deleted in portfolio.deleteMultipleInvestments). The legacy
// query relied on a `type` column that the SELL insert never writes — replaced
// here with a UNION over the two real sources.
exports.getInvestmentBehaviour = async (req, res) => {
  try {
    const { user_id } = req.params;

    const [data] = await db.query(
      `SELECT 'BUY' AS type,
              COUNT(*) AS count,
              COALESCE(SUM(amount), 0) AS total
         FROM investments
        WHERE user_id = ?
       UNION ALL
       SELECT 'SELL' AS type,
              COUNT(*) AS count,
              COALESCE(SUM(amount), 0) AS total
         FROM investment_transactions
        WHERE user_id = ?`,
      [user_id, user_id]
    );

    res.json({ success: true, data });
  } catch (err) {
    console.error("getInvestmentBehaviour error:", err);
    res.status(500).json({ message: "Error fetching investment behaviour" });
  }
};