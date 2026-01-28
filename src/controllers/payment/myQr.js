const db = require("../../config/db");
const QRCode = require("qrcode");

/* =========================
   GENERATE USER QR (My QR)
========================= */
exports.generateUserQR = async (req, res) => {
  const { upi_id } = req.params;

  db.query(
    "SELECT full_name, upi_id, status FROM users WHERE upi_id = ?",
    [upi_id],
    async (err, result) => {
      if (err) return res.status(500).json({ error: "DB_ERROR" });

      if (result.length === 0)
        return res.status(404).json({ error: "USER_NOT_FOUND" });

      if (result[0].status !== "ACTIVE")
        return res.status(403).json({ error: "USER_BLOCKED" });

      const user = result[0];

      // 🔐 UPI QR (NO amount)
      const upiQRString = `upi://pay?pa=${user.upi_id}&pn=${encodeURIComponent(
        user.full_name
      )}&cu=INR`;

      try {
        const qrImage = await QRCode.toDataURL(upiQRString);

        res.json({
          upi_id: user.upi_id,
          full_name: user.full_name,
          qr_string: upiQRString,
          qr_image: qrImage
        });
      } catch (err) {
        res.status(500).json({ error: "QR_GENERATION_FAILED" });
      }
    }
  );
};
