const db = require("../../config/db");
exports.updateWalletLimit = async (req, res) => {
  try {
    const { upi_id, wallet_limit } = req.body;

    if (!upi_id || !wallet_limit) {
      return res.status(400).json({
        success: false,
        message: "upi_id and wallet_limit are required"
      });
    }

    const query = `
      UPDATE users
      SET wallet_limit = ?
      WHERE upi_id = ?
    `;

    const [result] = await db.execute(query, [wallet_limit, upi_id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    res.status(200).json({
      success: true,
      message: "Wallet limit updated successfully",
      wallet_limit
    });

  } catch (error) {
    console.error("Error updating wallet limit:", error);

    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};