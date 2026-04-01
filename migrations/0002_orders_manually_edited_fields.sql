ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "manually_edited_fields" jsonb DEFAULT '[]'::jsonb;
--> statement-breakpoint
UPDATE orders o
SET manually_edited_fields = (
  SELECT jsonb_agg(DISTINCT cl.field_name)
  FROM order_change_log cl
  WHERE cl.order_id = o.id
    AND cl.change_type = 'FIELD_EDIT'
    AND cl.field_name IS NOT NULL
    AND cl.field_name != 'multiple'
)
WHERE EXISTS (
  SELECT 1 FROM order_change_log cl2
  WHERE cl2.order_id = o.id
    AND cl2.change_type = 'FIELD_EDIT'
    AND cl2.field_name IS NOT NULL
    AND cl2.field_name != 'multiple'
)
AND (o.manually_edited_fields IS NULL OR o.manually_edited_fields = '[]'::jsonb);
--> statement-breakpoint
UPDATE orders o
SET manually_edited_fields = (
  SELECT jsonb_agg(DISTINCT elem)
  FROM (
    SELECT jsonb_array_elements_text(COALESCE(o.manually_edited_fields, '[]'::jsonb)) AS elem
    UNION
    SELECT (jsonb_array_elements(cl.metadata->'changes'))->>'field' AS elem
    FROM order_change_log cl
    WHERE cl.order_id = o.id
      AND cl.change_type = 'FIELD_EDIT'
      AND cl.field_name = 'multiple'
      AND cl.metadata IS NOT NULL
      AND jsonb_typeof(cl.metadata->'changes') = 'array'
  ) sub
  WHERE elem IS NOT NULL
)
FROM (
  SELECT DISTINCT cl.order_id
  FROM order_change_log cl
  WHERE cl.change_type = 'FIELD_EDIT'
    AND cl.field_name = 'multiple'
    AND cl.metadata IS NOT NULL
    AND jsonb_typeof(cl.metadata->'changes') = 'array'
) affected
WHERE affected.order_id = o.id;
