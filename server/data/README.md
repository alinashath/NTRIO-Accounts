# Ntrio statement import

Cashflow rows use **USD** and **MVR** columns per month. When transcribing into the generator tuples (`Feb USD`, `Feb MVR`, …): if the USD cell for that month is empty, the figure belongs in **MVR only**. For rows where the MVR column is only the USD × 20 display (salaries, SENORA, Ezee, etc.), the generator uses `suppressMvrWhenUsd: true` so **USD is posted once** and the paired MVR is not imported. Pocket money is entered as USD-only lines. Do not copy a February figure into March when March is blank.

1. **Regenerate JSON** (optional, if you change the generator):

   ```bash
   cd server
   npm run generate:ntrio-json
   ```

   Or only print to stdout:

   ```bash
   node scripts/generate-ntrio-statement-json.mjs --stdout > data/ntrio-statement-import.json
   ```

2. **Clear app data** (keeps tables; scoped to one Supabase user id):

   ```bash
   npm run db:clear-data -- --user-id <your-auth-uuid>
   ```

   Global wipe (destructive, requires env guard):

   ```bash
   CONFIRM_CLEAR_ALL=yes npm run db:clear-data -- --all
   ```

3. **Import** (creates `BML USD` / `BML MVR` accounts and categories as needed; never touches `debts`):

   ```bash
   npm run import:ntrio -- --user-id <your-auth-uuid> --file data/ntrio-statement-import.json
   ```

   Dry run (no DB writes except user lookup):

   ```bash
   npm run import:ntrio -- --user-id <uuid> --file data/ntrio-statement-import.json --dry-run
   ```

   Post rows marked `needs_review`:

   ```bash
   npm run import:ntrio -- --user-id <uuid> --file data/ntrio-statement-import.json --include-review
   ```

Results are written next to the input file as `ntrio-statement-import.result.json`.
