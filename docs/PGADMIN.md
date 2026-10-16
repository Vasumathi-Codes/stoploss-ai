# Connect pgAdmin to the STOPLOSS AI Database

## 1. Start the database

```bash
cd stoploss-ai
npm run db:up        # starts the stoploss-db container
docker ps            # stoploss-db should show "healthy" and 0.0.0.0:5435->5432
```

## 2. Connection details

From `docker-compose.yml` / `.env` (local development only):

| Field    | Value       |
| -------- | ----------- |
| Host     | `localhost` |
| Port     | `5435`      |
| Database | `stoploss`  |
| Username | `stoploss`  |
| Password | `stoploss`  |

## 3. Register the server in pgAdmin

1. Open pgAdmin → right-click **Servers** → **Register** → **Server…**
2. **General** tab → Name: `STOPLOSS AI (local)`
3. **Connection** tab:
   - Host name/address: `localhost`
   - Port: `5435`
   - Maintenance database: `stoploss`
   - Username: `stoploss`
   - Password: `stoploss` (tick **Save password**)
4. Click **Save**.

## 4. Find the tables

**Servers → STOPLOSS AI (local) → Databases → stoploss → Schemas → public → Tables**

Right-click a table → **View/Edit Data → All Rows**. Useful queries (**Tools → Query Tool**):

```sql
SELECT reference, status, amount, "reportedAt" FROM incidents ORDER BY "reportedAt" DESC;

SELECT i.reference, a.title, a.status
FROM action_items a JOIN incidents i ON i.id = a."incidentId"
ORDER BY i.reference, a."createdAt";
```

Column names are camelCase, so quote them in SQL: `"incidentId"`, `"createdAt"`.

## Troubleshooting

| Problem                        | Fix                                                                                                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Connection refused             | Container isn't running: `npm run db:up`                                                                                                                                                       |
| Password authentication failed | Another Postgres is using port 5435. Stop it, or change the host side of the port mapping in `docker-compose.yml` (e.g. `"5436:5432"`) and use that port (update `DATABASE_URL` in `.env` too) |
| pgAdmin itself runs in Docker  | Use host `host.docker.internal` instead of `localhost`                                                                                                                                         |
| Tables missing                 | Run `npm run db:deploy` then `npm run db:seed`                                                                                                                                                 |
| Data looks stale               | Right-click the table → **Refresh**                                                                                                                                                            |

## Notes

- Prefer the app or Prisma for writes; editing rows by hand can break consistency (e.g. agent states vs. findings).
- `npm run db:seed` restores the sample data at any time.
- Alternative without pgAdmin: `npm run db:studio` opens Prisma Studio in the browser.
- Table and column reference: [DATABASE.md](./DATABASE.md).
