const db = require("../../config/db");

// 📊 GET ALL INVESTMENTS (For Admin Panel)
exports.getAllInvestments = async (req, res) => {
  try {
    const { status } = req.query; 

    let query = `
      SELECT 
        i.id,
        i.user_id,
        i.fund_name,
        i.category,
        i.amount,
        i.nav,
        i.units,
        i.status AS investment_status,
        i.created_at AS investment_date,

        u.full_name,
        u.phone,
        u.upi_id,
        u.balance,
        u.wallet_balance,
        u.risk_factor

      FROM investments i
      JOIN users u ON i.user_id = u.id
    `;

    const values = [];

    // Optional filter (Active / Inactive)
    if (status) {
      query += ` WHERE i.status = ?`;
      values.push(status);
    }

    query += ` ORDER BY i.created_at DESC`;

    const [investments] = await db.query(query, values);

    res.json({
      success: true,
      count: investments.length,
      data: investments,
    });

  } catch (err) {
    console.error("Error fetching all investments:", err);
    res.status(500).json({
      success: false,
      message: "Error fetching investments",
    });
  }
};  

// 📈 GET GLOBAL INVESTMENT STATS
exports.getGlobalStats = async (req, res) => {
  try {
    const [totalInvested] = await db.query(
      "SELECT SUM(amount) as total_amount FROM investments WHERE status = 'ACTIVE'"
    );

    const [activeUsers] = await db.query(
      "SELECT COUNT(DISTINCT user_id) as user_count FROM investments WHERE status = 'ACTIVE'"
    );

    const [fundCount] = await db.query(
      "SELECT COUNT(DISTINCT fund_name) as fund_count FROM investments"
    );

    res.json({
      success: true,
      stats: {
        total_amount: totalInvested[0].total_amount || 0,
        investor_count: activeUsers[0].user_count || 0,
        fund_count: fundCount[0].fund_count || 0,
      },
    });
  } catch (err) {
    console.error("Error fetching global stats:", err);
    res.status(500).json({ message: "Error fetching stats" });
  }
};
