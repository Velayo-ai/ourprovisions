-- 006_delete_custom_catalog_item.sql
-- Hard-deletes a custom (non-global) catalog item household-wide.
-- Guards: item must exist, be custom, and belong to the calling household.
-- Removes all references (contributors, list_items, user_hidden_items,
-- waste_events) before deleting the catalog row. SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.delete_custom_catalog_item(
  p_household_id uuid,
  p_catalog_item_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_is_global boolean;
  v_household uuid;
BEGIN
  SELECT is_global, household_id
    INTO v_is_global, v_household
    FROM catalog_items
    WHERE id = p_catalog_item_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Catalog item % not found', p_catalog_item_id;
  END IF;

  IF v_is_global THEN
    RAISE EXCEPTION 'Cannot delete a global catalog item';
  END IF;

  IF v_household IS DISTINCT FROM p_household_id THEN
    RAISE EXCEPTION 'Catalog item % does not belong to household %', p_catalog_item_id, p_household_id;
  END IF;

  DELETE FROM list_item_contributors
    WHERE list_item_id IN (
      SELECT id FROM list_items
      WHERE catalog_item_id = p_catalog_item_id
        AND household_id = p_household_id
    );

  DELETE FROM list_items
    WHERE catalog_item_id = p_catalog_item_id
      AND household_id = p_household_id;

  DELETE FROM user_hidden_items
    WHERE catalog_item_id = p_catalog_item_id;

  DELETE FROM waste_events
    WHERE catalog_item_id = p_catalog_item_id
      AND household_id = p_household_id;

  DELETE FROM catalog_items
    WHERE id = p_catalog_item_id
      AND is_global = false
      AND household_id = p_household_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.delete_custom_catalog_item(uuid, uuid) TO authenticated;