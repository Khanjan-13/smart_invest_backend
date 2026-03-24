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