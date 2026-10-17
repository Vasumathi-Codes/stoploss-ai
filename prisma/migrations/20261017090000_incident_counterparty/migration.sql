-- Where the money went (UPI ID, phone number or account). Optional; existing rows are unaffected.
ALTER TABLE "incidents" ADD COLUMN "counterparty" VARCHAR(120);
