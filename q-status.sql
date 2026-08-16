SELECT status, COUNT(*) n FROM email_quotation_items GROUP BY status ORDER BY n DESC;
SELECT COUNT(*) total FROM email_quotation_items;
