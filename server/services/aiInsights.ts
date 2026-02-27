import OpenAI from "openai";
import { pool } from "../db";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const DB_SCHEMA_CONTEXT = `
You are ShipFlow AI, an analytics assistant for a logistics & marketing SaaS platform used by Shopify merchants in Pakistan.
All monetary values are in PKR (Pakistani Rupees) unless noted. The USD-to-PKR exchange rate varies per merchant.

DATABASE TABLES (complete column list for each table):

1. orders (main order table):
   - id (varchar PK), merchant_id (varchar FK), shopify_order_id (varchar), order_number (varchar)
   - customer_name (varchar), customer_email (varchar), customer_phone (varchar)
   - shipping_address (text), city (varchar), province (varchar), postal_code (varchar), country (varchar, default 'Pakistan')
   - total_amount (decimal), subtotal_amount (decimal), shipping_amount (decimal), discount_amount (decimal)
   - currency (varchar, default 'PKR'), payment_method (varchar), payment_status (varchar), fulfillment_status (varchar)
   - order_status (varchar: pending/confirmed/cancelled)
   - line_items (jsonb array of {title, quantity, price, sku, product_id})
   - total_quantity (integer)
   - tags (text array), notes (text), remark (text), item_summary (text)
   - courier_name (varchar), courier_tracking (varchar), courier_raw_status (text)
   - shipment_status (varchar: pending/booked/picked/in_transit/delivered/returned/failed)
   - workflow_status (varchar: NEW/CONFIRMED/DISPATCHED/DELIVERED/RETURNED/CANCELLED/ON_HOLD/PENDING)
   - pending_reason (text), pending_reason_type (varchar)
   - hold_until (timestamp), hold_created_at (timestamp)
   - cancel_reason (text), cancelled_at (timestamp)
   - previous_workflow_status (varchar), last_status_changed_at (timestamp)
   - confirmed_at (timestamp), booked_at (timestamp), fulfilled_at (timestamp)
   - dispatched_at (timestamp), delivered_at (timestamp), returned_at (timestamp)
   - booking_status (varchar)
   - prepaid_amount (decimal, default 0), cod_remaining (decimal), cod_payment_status (varchar: UNPAID/PARTIAL/PAID)
   - landing_site (text), referring_site (text), order_source (varchar)
   - order_date (timestamp), created_at (timestamp), updated_at (timestamp)

2. shipments:
   - id (varchar PK), order_id (varchar FK->orders), merchant_id (varchar FK)
   - courier_name (varchar: leopards/postex/trax), tracking_number (varchar), awb_number (varchar)
   - status (varchar: booked/picked/in_transit/out_for_delivery/delivered/returned/failed)
   - status_description (text)
   - weight (decimal), cod_amount (decimal), cod_sent_to_courier (decimal), prepaid_at_booking (decimal)
   - shipping_cost (decimal)
   - estimated_delivery (timestamp), actual_delivery (timestamp)
   - delivery_attempts (integer, default 0), last_status_update (timestamp)
   - loadsheet_batch_id (varchar)
   - created_at (timestamp), updated_at (timestamp)

3. shipment_events (tracking timeline for shipments):
   - id (varchar PK), shipment_id (varchar FK->shipments)
   - status (varchar), description (text), location (varchar)
   - event_time (timestamp), created_at (timestamp)

4. products:
   - id (varchar PK), merchant_id (varchar FK), shopify_product_id (varchar)
   - title (varchar), handle (varchar), vendor (varchar), product_type (varchar)
   - status (varchar), total_inventory (integer), variants (jsonb)
   - created_at (timestamp), updated_at (timestamp)

5. order_payments (prepaid/partial payments on orders):
   - id (varchar PK), merchant_id (varchar FK), order_id (varchar FK->orders)
   - amount (decimal), method (varchar: CASH/BANK/EASYPAISA/JAZZCASH)
   - reference (varchar), notes (text), created_at (timestamp)

6. cod_reconciliation (COD settlement tracking):
   - id (varchar PK), merchant_id (varchar FK), shipment_id (varchar FK), order_id (varchar FK)
   - courier_name (varchar), tracking_number (varchar)
   - cod_amount (decimal), courier_fee (decimal), net_amount (decimal)
   - status (varchar: pending/received/disputed)
   - courier_settlement_ref (varchar), courier_settlement_date (timestamp)
   - transaction_fee (decimal), transaction_tax (decimal)
   - created_at (timestamp), updated_at (timestamp)

7. ad_campaigns (Meta/Facebook campaigns):
   - id (varchar PK), merchant_id (varchar FK), campaign_id (varchar, Facebook ID)
   - name (varchar), status (varchar), effective_status (varchar)
   - objective (varchar), daily_budget (decimal), lifetime_budget (decimal)
   - created_time (timestamp)

8. ad_insights (daily performance metrics for campaigns/adsets/ads):
   - id (varchar PK), merchant_id (varchar FK), ad_account_id (varchar FK)
   - level (varchar: campaign/adset/ad), entity_id (varchar), entity_type (varchar)
   - date (varchar YYYY-MM-DD format, NOT a timestamp)
   - impressions (integer), reach (integer), clicks (integer)
   - spend (decimal, in USD — multiply by dollar_rate for PKR), frequency (decimal)
   - cpc (decimal), cpm (decimal), ctr (decimal)
   - link_clicks (integer), landing_page_views (integer)
   - outbound_clicks (integer), unique_outbound_clicks (integer)
   - view_content (integer), add_to_cart (integer), initiate_checkout (integer)
   - purchases (integer), purchase_value (decimal), roas (decimal)
   - cost_per_purchase (decimal), cost_per_checkout (decimal), cost_per_add_to_cart (decimal), cost_per_view_content (decimal)
   - video_views (integer), video_thru_plays (integer), video_3s_views (integer), video_95p_views (integer)

9. ad_creatives (individual ads):
   - id (varchar PK), merchant_id (varchar FK), campaign_id (varchar), adset_id (varchar), ad_id (varchar)
   - name (varchar), destination_url (varchar), matched_product_id (varchar FK->products)

10. campaign_journey_events (strategic decisions log):
    - merchant_id (varchar FK), campaign_key (varchar), signal (varchar: Scale/Watch/Risk)
    - action_taken (text), rationale (text), evaluation_window_hours (integer)
    - snapshot_before (jsonb metrics), snapshot_after (jsonb metrics)
    - created_at (timestamp)

11. expenses:
    - id (varchar PK), merchant_id (varchar FK)
    - title (varchar), description (text), amount (decimal)
    - paid_amount (decimal, default 0), remaining_due (decimal)
    - payment_status (varchar: unpaid/partial/paid)
    - party_id (varchar FK), category (varchar), date (timestamp)
    - payment_method (varchar), reference (varchar)
    - is_recurring (boolean), notes (text)
    - created_at (timestamp), updated_at (timestamp)

12. stock_ledger (inventory movements):
    - id (varchar PK), merchant_id (varchar FK)
    - type (varchar: purchase/sale/adjustment), product_name (varchar), sku (varchar)
    - quantity (integer), unit_price (decimal), total_value (decimal)
    - supplier (varchar), reference (varchar), date (timestamp)
    - notes (text), created_at (timestamp)

13. courier_dues (courier payment tracking):
    - id (varchar PK), merchant_id (varchar FK)
    - courier_name (varchar), type (varchar), amount (decimal)
    - description (varchar), reference (varchar)
    - due_date (timestamp), status (varchar: pending/paid), paid_date (timestamp)
    - date (timestamp), notes (text), created_at (timestamp)

RULES:
- ALWAYS filter by merchant_id = $1 (parameterized) in EVERY table referenced. This is mandatory for security.
- Only generate SELECT queries (read-only). Never use DELETE, UPDATE, INSERT, DROP, ALTER, TRUNCATE, EXECUTE, COPY, LOAD.
- ALWAYS include LIMIT (max 50 rows). Example: LIMIT 50
- NEVER reference these tables: users, team_members, merchants, sessions, conversations, messages, ai_insight_cache
- NEVER reference columns containing: password, secret, token, encrypt
- NEVER reference pg_ system tables or information_schema
- Use proper date formatting: dates in orders are timestamps, dates in ad_insights are varchar 'YYYY-MM-DD'
- For date ranges, use order_date for orders table and date for ad_insights
- spend in ad_insights is in USD; multiply by dollar_rate (provided) for PKR conversion
- Use meaningful aliases for columns
- When computing percentages, handle division by zero with NULLIF
- In JOINs, ensure both tables filter by merchant_id = $1
- For pipeline/workflow analysis, use confirmed_at, dispatched_at, delivered_at, returned_at, cancelled_at timestamps to calculate time between stages
- For COD analysis, use prepaid_amount, cod_remaining, and cod_payment_status from orders
`;

interface InsightPrompt {
  key: string;
  title: string;
  category: string;
  prompt: string;
  section: string;
}

const INSIGHT_PROMPTS: InsightPrompt[] = [
  {
    key: "campaign_performance",
    title: "Campaign Performance",
    category: "campaigns",
    section: "marketing",
    prompt: `Analyze the top 10 campaigns by spend in the last 14 days. For each, calculate total spend, purchases, ROAS, and cost per purchase. Identify which are profitable and which are losing money. Provide a brief strategic recommendation.`
  },
  {
    key: "return_rate",
    title: "Return Rate Analysis", 
    category: "operations",
    section: "marketing",
    prompt: `Compare the return/failed delivery rate for the last 7 days vs the previous 7 days. Break it down by city if possible. Flag any cities with return rates above 20%.`
  },
  {
    key: "spend_efficiency",
    title: "Ad Spend Efficiency",
    category: "campaigns",
    section: "marketing",
    prompt: `Analyze overall ad spend efficiency for the last 7 days: total spend, total purchases from ads, average CPA, and ROAS. Compare with the previous 7 days. Is efficiency improving or declining?`
  },
  {
    key: "top_cities",
    title: "Top Cities by Orders",
    category: "operations", 
    section: "marketing",
    prompt: `Show the top 10 cities by order count in the last 14 days, with delivery rate, return rate, and average order value for each city.`
  },
  {
    key: "order_trends",
    title: "Order Trends",
    category: "operations",
    section: "marketing",
    prompt: `Analyze daily order volume for the last 14 days. Identify the trend (increasing/decreasing/stable), peak days, and any anomalies. Compare weekday vs weekend performance.`
  },
  {
    key: "funnel_analysis",
    title: "Marketing Funnel",
    category: "campaigns",
    section: "marketing",
    prompt: `Analyze the marketing funnel for the last 7 days: impressions → clicks → landing page views → add to cart → checkout → purchase. Calculate drop-off rates at each stage and identify the biggest bottleneck.`
  },
  {
    key: "dashboard_health",
    title: "Business Health",
    category: "overview",
    section: "dashboard",
    prompt: `Give an overall business health assessment for the last 7 days: total orders, total revenue (PKR), fulfillment rate (dispatched/total), delivery rate (delivered/dispatched), return rate, and average order value. Compare key metrics with the previous 7 days. Highlight any concerning trends.`
  },
  {
    key: "dashboard_pending",
    title: "Pending Orders Alert",
    category: "operations",
    section: "dashboard",
    prompt: `Analyze orders currently in pending/hold/new status (workflow_status IN ('NEW','PENDING','ON_HOLD')). How many are there? What's the average age of these orders? Are there any that have been pending for more than 3 days? Recommend actions.`
  },
  {
    key: "dashboard_revenue",
    title: "Revenue Trend",
    category: "finance",
    section: "dashboard",
    prompt: `Analyze daily revenue (total_amount from orders) for the last 14 days. Identify the trend, peak days, and average daily revenue. Is revenue growing, stable, or declining compared to the previous 14 days?`
  },
  {
    key: "analytics_delivery",
    title: "Delivery Performance",
    category: "operations",
    section: "analytics",
    prompt: `Analyze delivery performance for the last 14 days: overall delivery rate, average delivery attempts, courier-wise delivery success rates (from shipments table by courier_name). Which courier has the best and worst performance? Any recommendations for courier selection?`
  },
  {
    key: "analytics_cities",
    title: "City Performance",
    category: "operations",
    section: "analytics",
    prompt: `Show top 10 cities by order volume in the last 14 days. For each city, show order count, delivery rate (delivered/total), return rate, and average order value. Flag cities with return rates above 15% and suggest whether to continue or reduce advertising there.`
  },
  {
    key: "analytics_products",
    title: "Product Insights",
    category: "products",
    section: "analytics",
    prompt: `Analyze the top 10 products by order count in the last 14 days using line_items jsonb in orders. For each product, show order count, total revenue, and return rate if possible. Which products are performing best?`
  },
  {
    key: "pipeline_bottleneck",
    title: "Pipeline Bottlenecks",
    category: "operations",
    section: "pipeline",
    prompt: `Analyze the current order pipeline by workflow_status. Count orders in each stage (NEW, CONFIRMED, DISPATCHED, DELIVERED, RETURNED, CANCELLED, ON_HOLD, PENDING). Show the percentage distribution across stages. Identify which non-terminal stage (NEW, PENDING, ON_HOLD, CONFIRMED) has the most orders stuck and recommend actions.`
  },
  {
    key: "pipeline_confirmation",
    title: "Confirmation Insights",
    category: "operations",
    section: "pipeline",
    prompt: `Analyze orders that were confirmed in the last 7 days. What's the average time from NEW to CONFIRMED? What percentage of new orders get confirmed vs cancelled? Are there specific times of day or days of the week when confirmation is faster?`
  },
  {
    key: "pipeline_cancellation",
    title: "Cancellation Patterns",
    category: "risk",
    section: "pipeline",
    prompt: `Analyze cancelled orders from the last 14 days. What percentage of total orders are cancelled? What are the most common cancel_reason values? At which pipeline stage do most cancellations happen? Any patterns by city or payment method?`
  },
  {
    key: "shipments_courier",
    title: "Courier Comparison",
    category: "operations",
    section: "shipments",
    prompt: `Compare all couriers used in the last 14 days from the shipments table. For each courier_name, show: total shipments, delivered count, returned count, delivery success rate, average delivery_attempts, and average shipping_cost. Which courier provides the best value?`
  },
  {
    key: "shipments_returns",
    title: "Return Analysis",
    category: "risk",
    section: "shipments",
    prompt: `Deep dive into returned/failed shipments from the last 14 days. What's the overall return rate? Break down by courier, city, and payment method. What's the financial impact (sum of cod_amount for returned orders)? Identify patterns and recommend actions to reduce returns.`
  },
  {
    key: "shipments_cod",
    title: "COD Collection Status",
    category: "finance",
    section: "shipments",
    prompt: `Analyze COD collection status from shipments in the last 30 days. Total COD amount for delivered shipments, total collected vs pending. Group by courier. Flag any couriers with significant pending COD amounts.`
  },
  {
    key: "finance_revenue",
    title: "Revenue Analysis",
    category: "finance",
    section: "finance",
    prompt: `Analyze revenue for the last 30 days from orders. Daily revenue trend, total revenue, average order value. Compare with previous 30 days. Break down by payment method (COD vs prepaid). What percentage is COD?`
  },
  {
    key: "finance_expenses",
    title: "Expense Overview",
    category: "finance",
    section: "finance",
    prompt: `Analyze expenses from the last 30 days. Total expense amount, breakdown by category. Which category has the highest spending? Are there any unpaid expenses (payment_status = 'unpaid')? Compare with previous 30 days.`
  },
  {
    key: "finance_profitability",
    title: "Profitability Estimate",
    category: "finance",
    section: "finance",
    prompt: `Estimate profitability for the last 30 days: total revenue from orders (sum of total_amount for delivered orders), total ad spend from ad_insights (converted to PKR), total expenses, and total shipping costs from shipments. Calculate rough net profit. Is the business profitable?`
  },
];

const ALLOWED_TABLES = new Set([
  "orders", "shipments", "shipment_events", "products", "expenses",
  "ad_campaigns", "ad_sets", "ad_creatives", "ad_insights", "ad_accounts",
  "campaign_journey_events", "ad_profitability_entries", "meta_sync_runs",
  "cod_reconciliation", "order_payments", "courier_dues", "stock_ledger",
]);

const BLOCKED_PATTERNS = [
  /\bpg_/i,
  /\binformation_schema\b/i,
  /\bteam_members\b/i,
  /\busers\b/i,
  /\bmerchants\b/i,
  /\bsessions\b/i,
  /\bai_insight_cache\b/i,
  /\bpassword/i,
  /\bsecret/i,
  /\btoken/i,
  /\bencrypt/i,
];

function validateQuery(query: string): void {
  const normalized = query.trim();
  const upper = normalized.toUpperCase();

  if (!upper.startsWith("SELECT") && !upper.startsWith("WITH")) {
    throw new Error("Only SELECT/WITH queries are allowed");
  }

  const forbidden = /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT|REVOKE|EXECUTE|COPY|LOAD)\b/i;
  if (forbidden.test(normalized)) {
    throw new Error("Only SELECT queries are allowed");
  }

  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(normalized)) {
      throw new Error("Query references restricted tables or columns");
    }
  }

  if (!normalized.includes("$1")) {
    throw new Error("Query must include merchant_id parameter ($1)");
  }

  if (!/LIMIT\s+\d+/i.test(normalized)) {
    throw new Error("Query must include a LIMIT clause");
  }
}

async function executeReadOnlyQuery(query: string, params: any[]): Promise<any[]> {
  validateQuery(query);

  const client = await pool.connect();
  try {
    await client.query("SET statement_timeout = '10s'");
    await client.query("BEGIN READ ONLY");
    const result = await client.query(query, params);
    await client.query("COMMIT");
    return result.rows;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function generateChatResponse(
  userQuestion: string,
  merchantId: string,
  dollarRate: number = 280
): Promise<{ answer: string; sqlQuery?: string; data?: any[] }> {
  const sqlGenResponse = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `${DB_SCHEMA_CONTEXT}

You are given a user's question about their business data. Generate a PostgreSQL query to answer it.
The merchant_id parameter will be passed as $1. Use $1 in WHERE clauses.
The current USD to PKR rate is ${dollarRate}.
Current date: ${new Date().toISOString().split('T')[0]}

Respond in JSON format ONLY:
{
  "sql": "SELECT ... FROM ... WHERE merchant_id = $1 ...",
  "explanation": "Brief explanation of what this query does"
}

If the question cannot be answered with a SQL query, respond:
{
  "sql": null,
  "explanation": "Why this cannot be answered with data",
  "direct_answer": "Your best answer based on general knowledge"
}`
      },
      { role: "user", content: userQuestion }
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 8192,
  });

  const sqlResult = JSON.parse(sqlGenResponse.choices[0]?.message?.content || "{}");

  if (!sqlResult.sql) {
    return {
      answer: sqlResult.direct_answer || sqlResult.explanation || "I couldn't generate an answer for that question.",
    };
  }

  let data: any[];
  try {
    data = await executeReadOnlyQuery(sqlResult.sql, [merchantId]);
  } catch (error: any) {
    const safeError = error.message?.includes("restricted") || error.message?.includes("merchant_id") || error.message?.includes("LIMIT")
      ? error.message
      : "Query syntax error";
    const retryResponse = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `${DB_SCHEMA_CONTEXT}
The previous SQL query failed with error: ${safeError}
Fix the query. Ensure it includes merchant_id = $1 and LIMIT. Respond in JSON: { "sql": "fixed query" }`
        },
        { role: "user", content: userQuestion }
      ],
      response_format: { type: "json_object" },
      max_completion_tokens: 8192,
    });

    const retryResult = JSON.parse(retryResponse.choices[0]?.message?.content || "{}");
    if (!retryResult.sql) {
      return { answer: `I had trouble querying the data. Error: ${error.message}` };
    }
    try {
      data = await executeReadOnlyQuery(retryResult.sql, [merchantId]);
    } catch (retryError: any) {
      return { answer: `I couldn't retrieve the data after retrying. Error: ${retryError.message}` };
    }
  }

  const formatResponse = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are ShipFlow AI, an analytics assistant for a Pakistani e-commerce logistics business.
Format the query results into a clear, actionable answer. Use PKR for currency. Be specific with numbers.
Include recommendations where relevant. Use bullet points and bold for key metrics.
Keep the response concise but informative (max 400 words).
Current USD to PKR rate: ${dollarRate}`
      },
      {
        role: "user",
        content: `Question: ${userQuestion}\n\nQuery results (${data.length} rows):\n${JSON.stringify(data.slice(0, 30), null, 2)}`
      }
    ],
    max_completion_tokens: 8192,
  });

  return {
    answer: formatResponse.choices[0]?.message?.content || "No response generated.",
    sqlQuery: sqlResult.sql,
    data: data.slice(0, 20),
  };
}

type InsightResult = {
  key: string;
  title: string;
  category: string;
  summary: string;
  metrics: Array<{ label: string; value: string; trend?: "up" | "down" | "stable" }>;
};

export const VALID_SECTIONS = ["marketing", "dashboard", "analytics", "pipeline", "shipments", "finance"] as const;
export type InsightSection = typeof VALID_SECTIONS[number];

export async function generateSectionInsights(
  merchantId: string,
  section: InsightSection,
  dollarRate: number = 280
): Promise<InsightResult[]> {
  const sectionPrompts = INSIGHT_PROMPTS.filter((p) => p.section === section);
  return generateInsightsFromPrompts(sectionPrompts, merchantId, dollarRate);
}

export async function generateDashboardInsights(
  merchantId: string,
  dollarRate: number = 280
): Promise<InsightResult[]> {
  const marketingPrompts = INSIGHT_PROMPTS.filter((p) => p.section === "marketing");
  return generateInsightsFromPrompts(marketingPrompts, merchantId, dollarRate);
}

async function generateInsightsFromPrompts(
  prompts: InsightPrompt[],
  merchantId: string,
  dollarRate: number
): Promise<InsightResult[]> {
  const results: InsightResult[] = [];

  for (const insight of prompts) {
    try {
      const sqlGenResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `${DB_SCHEMA_CONTEXT}
Generate a PostgreSQL query to: ${insight.prompt}
Use $1 for merchant_id. Current date: ${new Date().toISOString().split('T')[0]}. Dollar rate: ${dollarRate}.
Respond in JSON: { "sql": "SELECT ..." }`
          },
          { role: "user", content: insight.prompt }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 8192,
      });

      const sqlResult = JSON.parse(sqlGenResponse.choices[0]?.message?.content || "{}");
      if (!sqlResult.sql) continue;

      let data: any[];
      try {
        data = await executeReadOnlyQuery(sqlResult.sql, [merchantId]);
      } catch {
        continue;
      }

      const formatResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are ShipFlow AI. Summarize these analytics results into a dashboard insight card.
Respond in JSON format:
{
  "summary": "2-3 sentence summary with key findings and recommendation",
  "metrics": [
    { "label": "Metric Name", "value": "formatted value (e.g. PKR 12,500 or 15.3%)", "trend": "up|down|stable" }
  ]
}
Max 4 metrics. Use PKR for currency. Dollar rate: ${dollarRate}.`
          },
          {
            role: "user",
            content: `Analysis: ${insight.prompt}\n\nData (${data.length} rows):\n${JSON.stringify(data.slice(0, 20), null, 2)}`
          }
        ],
        response_format: { type: "json_object" },
        max_completion_tokens: 8192,
      });

      const formatted = JSON.parse(formatResponse.choices[0]?.message?.content || "{}");
      results.push({
        key: insight.key,
        title: insight.title,
        category: insight.category,
        summary: formatted.summary || "No data available for this period.",
        metrics: formatted.metrics || [],
      });
    } catch (error) {
      console.error(`AI insight generation failed for ${insight.key}:`, error);
      results.push({
        key: insight.key,
        title: insight.title,
        category: insight.category,
        summary: "Unable to generate this insight at the moment.",
        metrics: [],
      });
    }
  }

  return results;
}

export async function generateQuickStrategy(
  merchantId: string,
  dollarRate: number = 280
): Promise<string> {
  const queries = {
    recentSpend: `SELECT COALESCE(SUM(CAST(spend AS numeric)), 0) as total_spend, 
                  COALESCE(SUM(purchases), 0) as total_purchases,
                  COALESCE(SUM(CAST(purchase_value AS numeric)), 0) as total_revenue
                  FROM ad_insights WHERE merchant_id = $1 AND date >= (CURRENT_DATE - INTERVAL '7 days')::text LIMIT 1`,
    orderStats: `SELECT COUNT(*) as total_orders,
                 COUNT(*) FILTER (WHERE shipment_status = 'delivered') as delivered,
                 COUNT(*) FILTER (WHERE shipment_status IN ('returned','failed')) as returned,
                 COALESCE(AVG(CAST(total_amount AS numeric)), 0) as avg_order_value
                 FROM orders WHERE merchant_id = $1 AND order_date >= CURRENT_DATE - INTERVAL '7 days' LIMIT 1`,
    topCampaigns: `SELECT c.name, COALESCE(SUM(CAST(i.spend AS numeric)), 0) as spend,
                   COALESCE(SUM(i.purchases), 0) as purchases,
                   CASE WHEN SUM(CAST(i.spend AS numeric)) > 0 
                     THEN ROUND(SUM(CAST(i.purchase_value AS numeric)) / NULLIF(SUM(CAST(i.spend AS numeric)), 0), 2)
                     ELSE 0 END as roas
                   FROM ad_insights i 
                   JOIN ad_campaigns c ON c.campaign_id = i.entity_id AND c.merchant_id = i.merchant_id
                   WHERE i.merchant_id = $1 AND i.date >= (CURRENT_DATE - INTERVAL '7 days')::text AND i.level = 'campaign'
                   GROUP BY c.name ORDER BY spend DESC LIMIT 5`,
  };

  const data: Record<string, any[]> = {};
  for (const [key, sql] of Object.entries(queries)) {
    try {
      data[key] = await executeReadOnlyQuery(sql, [merchantId]);
    } catch {
      data[key] = [];
    }
  }

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are ShipFlow AI, a marketing strategist for Pakistani e-commerce businesses.
Based on the data provided, generate a concise weekly strategy brief. Include:
1. Overall performance assessment (1-2 sentences)
2. Top 3 actionable recommendations
3. Campaigns to scale up or cut
4. Any warnings or risks

Use PKR for currency (USD rate: ${dollarRate}). Be direct and specific. Max 300 words.`
      },
      {
        role: "user",
        content: `Last 7 days data:\n\nAd Spend Summary: ${JSON.stringify(data.recentSpend)}\n\nOrder Stats: ${JSON.stringify(data.orderStats)}\n\nTop Campaigns: ${JSON.stringify(data.topCampaigns)}`
      }
    ],
    max_completion_tokens: 8192,
  });

  return response.choices[0]?.message?.content || "Unable to generate strategy at this time.";
}
