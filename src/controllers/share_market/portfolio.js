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
      ORDER BY i.created_at DESC
    `;

    const [rows] = await db.execute(query, [upi_id]);

    if (rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: "No investments found"
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
  const { investment_ids } = req.body;

  if (!investment_ids || !Array.isArray(investment_ids) || investment_ids.length === 0) {
    return res.status(400).json({
      success: false,
      message: "Please provide valid investment IDs"
    });
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Get investments
    const [investments] = await connection.query(
      `SELECT * FROM investments WHERE id IN (?)`,
      [investment_ids]
    );

    if (investments.length === 0) {
      await connection.rollback();
      return res.status(404).json({
        success: false,
        message: "No investments found"
      });
    }

    const userId = investments[0].user_id;

    // Ensure all belong to same user
    const allSameUser = investments.every(inv => inv.user_id === userId);
    if (!allSameUser) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: "All investments must belong to same user"
      });
    }

    let totalRefund = 0;

    // 2. Insert into investment_transactions
    for (let inv of investments) {
      const amount = parseFloat(inv.amount);

      const commission = (amount * 0.8) / 100; // 0.8%
      const refundAmount = amount - commission;

      totalRefund += refundAmount;

      await connection.query(
        `INSERT INTO investment_transactions 
        (user_id, fund_name, category, transaction_type, amount, nav, units, commission, status) 
        VALUES (?, ?, ?, 'SELL', ?, ?, ?, ?, 'SUCCESS')`,
        [
          inv.user_id,
          inv.fund_name,
          inv.category,
          amount,
          inv.nav,
          inv.units,
          commission
        ]
      );
    }

    // 3. Delete investments
    await connection.query(
      `DELETE FROM investments WHERE id IN (?)`,
      [investment_ids]
    );

    // 4. Update user balance (after commission deduction)
    await connection.query(
      `UPDATE users SET balance = balance + ? WHERE id = ?`,
      [totalRefund, userId]
    );

    await connection.commit();

    return res.status(200).json({
      success: true,
      message: "Investments sold, logged, and balance refunded",
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