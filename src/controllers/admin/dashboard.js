const db = require("../../config/db");

// Helper: build a contiguous date series by left-joining a generated calendar
// onto a metric. We do this with a recursive CTE in MySQL 8+, which is what
// mysql2 + the existing codebase assume. If the DB is older, the missing-day
// rows simply won't appear — charts handle that gracefully.
const lastNDaysCTE = (days) => `
  WITH RECURSIVE cal(d) AS (
    SELECT CURDATE() - INTERVAL ${Number(days) - 1} DAY
    UNION ALL
    SELECT d + INTERVAL 1 DAY FROM cal WHERE d < CURDATE()
  )
`;

/* ===========================================================
   GET /api/admin/dashboard-summary
   Headline numbers + 30-day growth series for the overview cards.
=========================================================== */
exports.getDashboardSummary = async (req, res) => {
  try {
    // Totals — single round-trip via a small UNION'd query would save calls but
    // hurt readability. Five lookups against indexed columns is fine here.
    const [[{ total_users }]] = await db.query(
      "SELECT COUNT(*) AS total_users FROM users"
    );
    const [[{ active_user_count }]] = await db.query(
      "SELECT COUNT(*) AS active_user_count FROM users WHERE status = 'active'"
    );
    const [[{ total_transactions, total_txn_amount }]] = await db.query(
      `SELECT COUNT(*) AS total_transactions,
              COALESCE(SUM(amount), 0) AS total_txn_amount
         FROM transactions
        WHERE status = 'SUCCESS'`
    );
    const [[{ total_invested, active_investments }]] = await db.query(
      `SELECT COALESCE(SUM(amount), 0) AS total_invested,
              COUNT(*) AS active_investments
         FROM investments
        WHERE status = 'ACTIVE'`
    );
    const [[{ total_wallet }]] = await db.query(
      "SELECT COALESCE(SUM(wallet_balance), 0) AS total_wallet FROM users"
    );

    // "Active users" proxies — no activity log table exists, so we approximate
    // engagement using anyone who appeared on either side of a successful
    // transaction in the window. Documented in CLAUDE.md.
    const [[{ daily_active }]] = await db.query(
      `SELECT COUNT(DISTINCT u.id) AS daily_active
         FROM users u
         JOIN transactions t
           ON (t.payer_upi = u.upi_id OR t.payee_upi = u.upi_id)
        WHERE t.status = 'SUCCESS'
          AND t.created_at >= NOW() - INTERVAL 1 DAY`
    );
    const [[{ weekly_active }]] = await db.query(
      `SELECT COUNT(DISTINCT u.id) AS weekly_active
         FROM users u
         JOIN transactions t
           ON (t.payer_upi = u.upi_id OR t.payee_upi = u.upi_id)
        WHERE t.status = 'SUCCESS'
          AND t.created_at >= NOW() - INTERVAL 7 DAY`
    );
    const [[{ monthly_active }]] = await db.query(
      `SELECT COUNT(DISTINCT u.id) AS monthly_active
         FROM users u
         JOIN transactions t
           ON (t.payer_upi = u.upi_id OR t.payee_upi = u.upi_id)
        WHERE t.status = 'SUCCESS'
          AND t.created_at >= NOW() - INTERVAL 30 DAY`
    );

    // 30-day series — one row per day with all three metrics zero-filled.
    const [series] = await db.query(
      `${lastNDaysCTE(30)}
       SELECT cal.d AS date,
              COALESCE(t.txn_count, 0)   AS txn_count,
              COALESCE(t.txn_amount, 0)  AS txn_amount,
              COALESCE(i.inv_count, 0)   AS inv_count,
              COALESCE(i.inv_amount, 0)  AS inv_amount,
              COALESCE(u.new_users, 0)   AS new_users
         FROM cal
         LEFT JOIN (
           SELECT DATE(created_at) AS d,
                  COUNT(*) AS txn_count,
                  SUM(amount) AS txn_amount
             FROM transactions
            WHERE status = 'SUCCESS'
              AND created_at >= CURDATE() - INTERVAL 29 DAY
            GROUP BY DATE(created_at)
         ) t ON t.d = cal.d
         LEFT JOIN (
           SELECT DATE(created_at) AS d,
                  COUNT(*) AS inv_count,
                  SUM(amount) AS inv_amount
             FROM investments
            WHERE created_at >= CURDATE() - INTERVAL 29 DAY
            GROUP BY DATE(created_at)
         ) i ON i.d = cal.d
         LEFT JOIN (
           SELECT DATE(created_at) AS d,
                  COUNT(*) AS new_users
             FROM users
            WHERE created_at >= CURDATE() - INTERVAL 29 DAY
            GROUP BY DATE(created_at)
         ) u ON u.d = cal.d
        ORDER BY cal.d ASC`
    );

    res.json({
      success: true,
      totals: {
        total_users,
        active_user_count,
        total_transactions,
        total_txn_amount,
        total_invested,
        active_investments,
        total_wallet,
      },
      active: {
        daily: daily_active,
        weekly: weekly_active,
        monthly: monthly_active,
      },
      series_30d: series,
    });
  } catch (err) {
    console.error("getDashboardSummary error:", err);
    res.status(500).json({ success: false, message: "Failed to load summary" });
  }
};

/* ===========================================================
   GET /api/admin/financial-stats
   Distributions, top users, peak hours, behavioral insights.
=========================================================== */
exports.getFinancialStats = async (req, res) => {
  try {
    // Investment distribution by category
    const [categoryMix] = await db.query(
      `SELECT category,
              COUNT(*) AS count,
              SUM(amount) AS total
         FROM investments
        WHERE status = 'ACTIVE'
        GROUP BY category
        ORDER BY total DESC`
    );

    // Top users by total active investment
    const [topUsers] = await db.query(
      `SELECT u.id,
              u.full_name,
              u.upi_id,
              u.phone,
              COUNT(i.id) AS investment_count,
              SUM(i.amount) AS total_invested
         FROM investments i
         JOIN users u ON u.id = i.user_id
        WHERE i.status = 'ACTIVE'
        GROUP BY u.id, u.full_name, u.upi_id, u.phone
        ORDER BY total_invested DESC
        LIMIT 10`
    );

    // Average investment per investing user
    const [[avgRow]] = await db.query(
      `SELECT COALESCE(AVG(per_user.total), 0) AS avg_invested,
              COUNT(*) AS investor_count
         FROM (
           SELECT user_id, SUM(amount) AS total
             FROM investments
            WHERE status = 'ACTIVE'
            GROUP BY user_id
         ) per_user`
    );

    // Peak hours — when do successful transactions happen?
    const [hours] = await db.query(
      `SELECT HOUR(created_at) AS hour,
              COUNT(*) AS count,
              SUM(amount) AS total
         FROM transactions
        WHERE status = 'SUCCESS'
        GROUP BY HOUR(created_at)
        ORDER BY hour ASC`
    );

    // Top spending categories — uses the free-text `notes` column. Empty notes
    // are bucketed as "Uncategorised" so the chart isn't dominated by NULL.
    const [topNotes] = await db.query(
      `SELECT COALESCE(NULLIF(TRIM(notes), ''), 'Uncategorised') AS category,
              COUNT(*) AS count,
              SUM(amount) AS total
         FROM transactions
        WHERE status = 'SUCCESS'
        GROUP BY COALESCE(NULLIF(TRIM(notes), ''), 'Uncategorised')
        ORDER BY total DESC
        LIMIT 10`
    );

    // Spending bucket distribution — "most users spend between X and Y"
    const [buckets] = await db.query(
      `SELECT bucket,
              COUNT(*) AS user_count
         FROM (
           SELECT user_id,
                  CASE
                    WHEN total < 500            THEN '0-500'
                    WHEN total < 2000           THEN '500-2k'
                    WHEN total < 10000          THEN '2k-10k'
                    WHEN total < 50000          THEN '10k-50k'
                    ELSE '50k+'
                  END AS bucket
             FROM (
               SELECT u.id AS user_id, COALESCE(SUM(t.amount), 0) AS total
                 FROM users u
                 LEFT JOIN transactions t
                   ON t.payer_upi = u.upi_id AND t.status = 'SUCCESS'
                GROUP BY u.id
             ) per_user
         ) bucketed
        GROUP BY bucket
        ORDER BY FIELD(bucket, '0-500', '500-2k', '2k-10k', '10k-50k', '50k+')`
    );

    // Concentration insight — what share of total invested do the top 10% hold?
    // Pull all per-user totals once and slice in JS; avoids a fragile LIMIT
    // binding and keeps the math obvious.
    const [perUser] = await db.query(
      `SELECT user_id, SUM(amount) AS total
         FROM investments
        WHERE status = 'ACTIVE'
        GROUP BY user_id
        ORDER BY total DESC`
    );

    const grandTotal = perUser.reduce((s, r) => s + Number(r.total), 0);
    const topCount = Math.max(1, Math.ceil(perUser.length * 0.1));
    const topTotal = perUser
      .slice(0, topCount)
      .reduce((s, r) => s + Number(r.total), 0);
    const top10Share = grandTotal > 0 ? (topTotal / grandTotal) * 100 : 0;
    const concentration = {
      grand_total: grandTotal,
      investor_count: perUser.length,
    };

    // Most-used "feature" by transaction payment_method
    const [methods] = await db.query(
      `SELECT payment_method,
              COUNT(*) AS count
         FROM transactions
        WHERE status = 'SUCCESS'
        GROUP BY payment_method
        ORDER BY count DESC`
    );

    // Build human-readable insight strings the frontend can render verbatim.
    const insights = [];

    const peakHour = [...hours].sort((a, b) => b.count - a.count)[0];
    if (peakHour) {
      const fmt = (h) => {
        const ampm = h >= 12 ? 'PM' : 'AM';
        const hr12 = ((h % 12) === 0) ? 12 : h % 12;
        return `${hr12} ${ampm}`;
      };
      insights.push(
        `Peak activity is around ${fmt(peakHour.hour)} (${peakHour.count} transactions).`
      );
    }

    const dominantBucket = [...buckets].sort((a, b) => b.user_count - a.user_count)[0];
    if (dominantBucket) {
      insights.push(
        `Most users spend in the ₹${dominantBucket.bucket} range (${dominantBucket.user_count} users).`
      );
    }

    if (concentration.investor_count > 0 && concentration.grand_total > 0) {
      insights.push(
        `Top 10% of investors hold ${top10Share.toFixed(1)}% of all active investments.`
      );
    }

    if (avgRow.investor_count > 0) {
      insights.push(
        `Average active investment per investor: ₹${Number(avgRow.avg_invested).toLocaleString('en-IN', { maximumFractionDigits: 0 })}.`
      );
    }

    if (methods[0]) {
      insights.push(
        `Most-used payment method: ${methods[0].payment_method} (${methods[0].count} txns).`
      );
    }

    res.json({
      success: true,
      category_mix: categoryMix,
      top_users: topUsers,
      avg_invested: Number(avgRow.avg_invested) || 0,
      investor_count: avgRow.investor_count,
      hours,
      top_notes: topNotes,
      spending_buckets: buckets,
      payment_methods: methods,
      concentration: {
        top_10pct_share_pct: Number(top10Share.toFixed(2)),
        grand_total: Number(concentration.grand_total) || 0,
        investor_count: concentration.investor_count,
      },
      insights,
    });
  } catch (err) {
    console.error("getFinancialStats error:", err);
    res.status(500).json({ success: false, message: "Failed to load stats" });
  }
};
