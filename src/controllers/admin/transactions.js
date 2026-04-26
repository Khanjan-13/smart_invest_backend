const db = require("../../config/db");

// Build a parameterized WHERE clause from the standard query filters used by
// every endpoint here. `alias` is the table alias the SQL uses for
// investment_transactions (default "it") so the same helper works inside
// joined queries. Returns an object with the WHERE fragment (already prefixed
// with WHERE when non-empty) and the matching params array.
function buildFilters(query, alias = "it") {
  const conds = [];
  const params = [];

  if (query.start_date) {
    conds.push(`${alias}.created_at >= ?`);
    params.push(`${query.start_date} 00:00:00`);
  }
  if (query.end_date) {
    conds.push(`${alias}.created_at <= ?`);
    params.push(`${query.end_date} 23:59:59`);
  }
  if (query.user_id) {
    conds.push(`${alias}.user_id = ?`);
    params.push(query.user_id);
  }
  if (query.fund_name) {
    conds.push(`${alias}.fund_name = ?`);
    params.push(query.fund_name);
  }
  if (query.category) {
    conds.push(`${alias}.category = ?`);
    params.push(query.category);
  }

  return {
    where: conds.length ? `WHERE ${conds.join(" AND ")}` : "",
    params,
  };
}

/* ===========================================================
   GET /api/admin/transactions
   Paginated list with optional filters. Joins users so the UI
   can render names/upi without a follow-up call.
=========================================================== */
exports.listTransactions = async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);

    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const offset = parseInt(req.query.offset, 10) || 0;

    const [rows] = await db.query(
      `SELECT it.id,
              it.user_id,
              it.fund_name,
              it.category,
              it.amount,
              it.nav,
              it.units,
              it.commission,
              it.created_at,
              u.full_name,
              u.upi_id,
              u.phone
         FROM investment_transactions it
         LEFT JOIN users u ON u.id = it.user_id
         ${where}
         ORDER BY it.created_at DESC
         LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[totals]] = await db.query(
      `SELECT COUNT(*)                  AS total_count,
              COALESCE(SUM(amount), 0)  AS total_amount,
              COALESCE(SUM(commission), 0) AS total_commission
         FROM investment_transactions it
         ${where}`,
      params
    );

    res.json({
      success: true,
      filters: req.query,
      pagination: { limit, offset, total: Number(totals.total_count) },
      totals: {
        amount: Number(totals.total_amount) || 0,
        commission: Number(totals.total_commission) || 0,
      },
      data: rows,
    });
  } catch (err) {
    console.error("listTransactions error:", err);
    res.status(500).json({ success: false, message: "Failed to load transactions" });
  }
};

/* ===========================================================
   GET /api/admin/analytics/summary
   Headline totals + daily/monthly time series + fund/category
   breakdowns. Honors the same filter set as the listing.
=========================================================== */
exports.getAnalyticsSummary = async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);

    const [[totals]] = await db.query(
      `SELECT COUNT(*)                     AS txn_count,
              COUNT(DISTINCT user_id)      AS investor_count,
              COUNT(DISTINCT fund_name)    AS fund_count,
              COALESCE(SUM(amount), 0)     AS total_amount,
              COALESCE(SUM(commission), 0) AS total_commission,
              COALESCE(AVG(amount), 0)     AS avg_amount
         FROM investment_transactions it
         ${where}`,
      params
    );

    const [daily] = await db.query(
      `SELECT DATE(it.created_at) AS date,
              COUNT(*)                     AS txn_count,
              COALESCE(SUM(amount), 0)     AS total_amount,
              COALESCE(SUM(commission), 0) AS total_commission
         FROM investment_transactions it
         ${where}
         GROUP BY DATE(it.created_at)
         ORDER BY date ASC`,
      params
    );

    const [monthly] = await db.query(
      `SELECT DATE_FORMAT(it.created_at, '%Y-%m') AS month,
              COUNT(*)                     AS txn_count,
              COALESCE(SUM(amount), 0)     AS total_amount,
              COALESCE(SUM(commission), 0) AS total_commission
         FROM investment_transactions it
         ${where}
         GROUP BY month
         ORDER BY month ASC`,
      params
    );

    const [byCategory] = await db.query(
      `SELECT category,
              COUNT(*)                     AS txn_count,
              COALESCE(SUM(amount), 0)     AS total_amount,
              COALESCE(SUM(commission), 0) AS total_commission
         FROM investment_transactions it
         ${where}
         GROUP BY category
         ORDER BY total_amount DESC`,
      params
    );

    const [byFund] = await db.query(
      `SELECT fund_name,
              category,
              COUNT(*)                     AS txn_count,
              COALESCE(SUM(amount), 0)     AS total_amount,
              COALESCE(SUM(commission), 0) AS total_commission
         FROM investment_transactions it
         ${where}
         GROUP BY fund_name, category
         ORDER BY total_amount DESC
         LIMIT 25`,
      params
    );

    res.json({
      success: true,
      filters: req.query,
      totals: {
        txn_count: Number(totals.txn_count) || 0,
        investor_count: Number(totals.investor_count) || 0,
        fund_count: Number(totals.fund_count) || 0,
        total_amount: Number(totals.total_amount) || 0,
        total_commission: Number(totals.total_commission) || 0,
        avg_amount: Number(totals.avg_amount) || 0,
      },
      daily,
      monthly,
      by_category: byCategory,
      by_fund: byFund,
    });
  } catch (err) {
    console.error("getAnalyticsSummary error:", err);
    res.status(500).json({ success: false, message: "Failed to load summary" });
  }
};

/* ===========================================================
   GET /api/admin/analytics/commission
   Commission-focused view: total, per-user (top N), per-fund,
   and a monthly trend line. Same filter set.
=========================================================== */
exports.getCommissionAnalytics = async (req, res) => {
  try {
    const { where, params } = buildFilters(req.query);

    const [[totals]] = await db.query(
      `SELECT COALESCE(SUM(commission), 0) AS total_commission,
              COALESCE(SUM(amount), 0)     AS total_amount,
              COUNT(*)                     AS txn_count
         FROM investment_transactions it
         ${where}`,
      params
    );

    const totalAmount = Number(totals.total_amount) || 0;
    const totalCommission = Number(totals.total_commission) || 0;
    const effectiveRate =
      totalAmount > 0 ? (totalCommission / totalAmount) * 100 : 0;

    const [perUser] = await db.query(
      `SELECT it.user_id,
              u.full_name,
              u.upi_id,
              COUNT(*)                     AS txn_count,
              COALESCE(SUM(it.amount), 0)  AS total_amount,
              COALESCE(SUM(it.commission), 0) AS total_commission
         FROM investment_transactions it
         LEFT JOIN users u ON u.id = it.user_id
         ${where}
         GROUP BY it.user_id, u.full_name, u.upi_id
         ORDER BY total_commission DESC
         LIMIT 25`,
      params
    );

    const [perFund] = await db.query(
      `SELECT fund_name,
              category,
              COUNT(*)                     AS txn_count,
              COALESCE(SUM(amount), 0)     AS total_amount,
              COALESCE(SUM(commission), 0) AS total_commission
         FROM investment_transactions it
         ${where}
         GROUP BY fund_name, category
         ORDER BY total_commission DESC
         LIMIT 25`,
      params
    );

    const [monthlyTrend] = await db.query(
      `SELECT DATE_FORMAT(it.created_at, '%Y-%m') AS month,
              COALESCE(SUM(commission), 0) AS total_commission,
              COALESCE(SUM(amount), 0)     AS total_amount,
              COUNT(*)                     AS txn_count
         FROM investment_transactions it
         ${where}
         GROUP BY month
         ORDER BY month ASC`,
      params
    );

    const [dailyTrend] = await db.query(
      `SELECT DATE(it.created_at) AS date,
              COALESCE(SUM(commission), 0) AS total_commission,
              COALESCE(SUM(amount), 0)     AS total_amount
         FROM investment_transactions it
         ${where}
         GROUP BY DATE(it.created_at)
         ORDER BY date ASC`,
      params
    );

    res.json({
      success: true,
      filters: req.query,
      totals: {
        total_commission: totalCommission,
        total_amount: totalAmount,
        txn_count: Number(totals.txn_count) || 0,
        effective_rate_pct: Number(effectiveRate.toFixed(4)),
      },
      per_user: perUser,
      per_fund: perFund,
      monthly_trend: monthlyTrend,
      daily_trend: dailyTrend,
    });
  } catch (err) {
    console.error("getCommissionAnalytics error:", err);
    res.status(500).json({ success: false, message: "Failed to load commission analytics" });
  }
};

/* ===========================================================
   GET /api/admin/analytics/user/:user_id
   Per-user investment + commission breakdown. Date filters
   still apply, the user_id from the path always wins.
=========================================================== */
exports.getUserAnalytics = async (req, res) => {
  try {
    const { user_id } = req.params;

    // Path param overrides any user_id in the query string.
    const filters = { ...req.query, user_id };
    const { where, params } = buildFilters(filters);

    const [[user]] = await db.query(
      `SELECT id, full_name, upi_id, phone, balance, wallet_balance, status
         FROM users
        WHERE id = ?`,
      [user_id]
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const [[totals]] = await db.query(
      `SELECT COUNT(*)                       AS txn_count,
              COALESCE(SUM(amount), 0)       AS total_amount,
              COALESCE(SUM(commission), 0)   AS total_commission,
              COALESCE(AVG(amount), 0)       AS avg_amount,
              MAX(it.created_at)             AS last_txn_at,
              MIN(it.created_at)             AS first_txn_at
         FROM investment_transactions it
         ${where}`,
      params
    );

    const [byFund] = await db.query(
      `SELECT fund_name,
              category,
              COUNT(*)                     AS txn_count,
              COALESCE(SUM(amount), 0)     AS total_amount,
              COALESCE(SUM(commission), 0) AS total_commission
         FROM investment_transactions it
         ${where}
         GROUP BY fund_name, category
         ORDER BY total_amount DESC`,
      params
    );

    const [byCategory] = await db.query(
      `SELECT category,
              COUNT(*)                     AS txn_count,
              COALESCE(SUM(amount), 0)     AS total_amount,
              COALESCE(SUM(commission), 0) AS total_commission
         FROM investment_transactions it
         ${where}
         GROUP BY category
         ORDER BY total_amount DESC`,
      params
    );

    const [daily] = await db.query(
      `SELECT DATE(it.created_at) AS date,
              COUNT(*)                     AS txn_count,
              COALESCE(SUM(amount), 0)     AS total_amount,
              COALESCE(SUM(commission), 0) AS total_commission
         FROM investment_transactions it
         ${where}
         GROUP BY DATE(it.created_at)
         ORDER BY date ASC`,
      params
    );

    const [recent] = await db.query(
      `SELECT id, fund_name, category, amount, nav, units, commission, created_at
         FROM investment_transactions it
         ${where}
         ORDER BY it.created_at DESC
         LIMIT 20`,
      params
    );

    res.json({
      success: true,
      user,
      totals: {
        txn_count: Number(totals.txn_count) || 0,
        total_amount: Number(totals.total_amount) || 0,
        total_commission: Number(totals.total_commission) || 0,
        avg_amount: Number(totals.avg_amount) || 0,
        first_txn_at: totals.first_txn_at,
        last_txn_at: totals.last_txn_at,
      },
      by_fund: byFund,
      by_category: byCategory,
      daily,
      recent,
    });
  } catch (err) {
    console.error("getUserAnalytics error:", err);
    res.status(500).json({ success: false, message: "Failed to load user analytics" });
  }
};
