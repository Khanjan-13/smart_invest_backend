const axios = require("axios");
const db = require("../../config/db");

exports.getUserPortfolio = async (req, res) => {
  try {
    const { upi_id } = req.params;

    if (!upi_id) {
      return res.status(400).json({
        success: false,
        message: "upi_id is required"
      });
    }

    const query = `
      SELECT i.*
      FROM investments i
      JOIN users u ON i.user_id = u.id
      WHERE u.upi_id = ?
      AND i.status = 'ACTIVE'
      ORDER BY i.created_at DESC
    `;

    const [rows] = await db.execute(query, [upi_id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No active investments found"
      });
    }

    res.status(200).json({
      success: true,
      total_investments: rows.length,
      data: rows
    });

  } catch (error) {
    console.error("Error fetching portfolio:", error);

    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};
exports.deleteMultipleInvestments = async (req, res) => {
  const { investment_ids, current_nav } = req.body;

  if (
    !investment_ids ||
    !Array.isArray(investment_ids) ||
    investment_ids.length === 0 ||
    !current_nav
  ) {
    return res.status(400).json({
      success: false,
      message: "Provide investment_ids and current_nav"
    });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Fetch ONLY ACTIVE investments
    const [investments] = await connection.query(
      `SELECT * FROM investments WHERE id IN (?) AND status = 'ACTIVE'`,
      [investment_ids]
    );

    if (investments.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "No active investments found"
      });
    }

    const userId = investments[0].user_id;

    // Ensure same user
    const allSameUser = investments.every(inv => inv.user_id === userId);
    if (!allSameUser) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "All investments must belong to same user"
      });
    }

    const currentNav = parseFloat(current_nav);

    let totalRefund = 0;

    // 2. Process investments
    for (let inv of investments) {
      const units = parseFloat(inv.units);

      const sellAmount = units * currentNav;

      const commission = (sellAmount * 0.8) / 100;
      const refundAmount = sellAmount - commission;

      totalRefund += refundAmount;

      // Insert transaction (SELL log)
      await connection.query(
        `INSERT INTO investment_transactions 
        (user_id, fund_name, category, amount, nav, units, commission) 
        VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          inv.user_id,
          inv.fund_name,
          inv.category,
          sellAmount,
          currentNav,
          units,
          commission
        ]
      );
    }

    // 3. SOFT DELETE (mark as INACTIVE)
    await connection.query(
      `UPDATE investments SET status = 'INACTIVE' WHERE id IN (?)`,
      [investment_ids]
    );

    // 4. Update user balance
    await connection.query(
      `UPDATE users SET balance = balance + ? WHERE id = ?`,
      [totalRefund, userId]
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "Investments sold and marked as inactive",
      refunded_amount: totalRefund
    });

  } catch (error) {
    await connection.rollback();
    console.error(error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong"
    });
  } finally {
    connection.release();
  }
};

exports.getInvestmentHistory = async (req, res) => {
  try {
    const { upi_id } = req.params;

    if (!upi_id) {
      return res.status(400).json({
        success: false,
        message: "upi_id is required"
      });
    }

    const query = `
      SELECT i.*
      FROM investments i
      JOIN users u ON i.user_id = u.id
      WHERE u.upi_id = ?
      AND i.status = 'INACTIVE'
      ORDER BY i.created_at DESC
    `;

    const [rows] = await db.execute(query, [upi_id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No investment history found"
      });
    }

    return res.status(200).json({
      success: true,
      total_records: rows.length,
      data: rows
    });

  } catch (error) {
    console.error("Error fetching investment history:", error);

    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};