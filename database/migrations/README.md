# Database Migrations

Complete database schema and migration scripts for Amazon RDS PostgreSQL with pgvector.

## Current Database: Supabase

We're currently using Supabase's managed PostgreSQL. All schema changes are applied directly through Supabase SQL Editor.

## Migration to Amazon RDS

### Prerequisites

1. **Amazon RDS PostgreSQL 15+**
   - Instance type: db.t3.medium or higher (for pgvector)
   - Storage: 100GB+ SSD
   - Enable automated backups

2. **Install pgvector extension**
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```

3. **PostgreSQL client tools**
   ```bash
   # Install psql (if not already installed)
   # macOS
   brew install postgresql@15
   
   # Ubuntu/Debian
   sudo apt-get install postgresql-client-15
   
   # Windows
   # Download from https://www.postgresql.org/download/windows/
   ```

### Migration Steps

#### Step 1: Export Data from Supabase

```bash
# Set Supabase connection
export SUPABASE_HOST=aws-0-us-east-1.pooler.supabase.com
export SUPABASE_PORT=6543
export SUPABASE_DB=postgres
export SUPABASE_USER=postgres.yfxqwqfxqnfqvvqxqxqx
export PGPASSWORD=your-supabase-password

# Export schema and data
pg_dump -h $SUPABASE_HOST -p $SUPABASE_PORT -U $SUPABASE_USER -d $SUPABASE_DB \
  --no-owner --no-acl --clean --if-exists \
  -t stevie_programs \
  -t stevie_categories \
  -t category_embeddings \
  -t user_profiles \
  -t chat_sessions \
  -t recommendations_history \
  > supabase_export.sql
```

#### Step 2: Create Fresh Schema on Amazon RDS

```bash
# Set RDS connection
export RDS_HOST=your-rds-endpoint.amazonaws.com
export RDS_PORT=5432
export RDS_DB=stevie_awards
export RDS_USER=postgres
export PGPASSWORD=your-rds-password

# Run initial schema migration
psql -h $RDS_HOST -p $RDS_PORT -U $RDS_USER -d $RDS_DB \
  -f 000_initial_schema.sql
```

#### Step 3: Import Data from Supabase

```bash
# Import the exported data
psql -h $RDS_HOST -p $RDS_PORT -U $RDS_USER -d $RDS_DB \
  -f supabase_export.sql
```

#### Step 4: Apply Additional Migrations

```bash
# Run any additional migrations in order
psql -h $RDS_HOST -p $RDS_PORT -U $RDS_USER -d $RDS_DB \
  -f 001_hybrid_scoring.sql
```

#### Step 5: Verify Migration

```bash
# Connect to RDS
psql -h $RDS_HOST -p $RDS_PORT -U $RDS_USER -d $RDS_DB

# Run verification queries
SELECT COUNT(*) FROM stevie_programs;
SELECT COUNT(*) FROM stevie_categories;
SELECT COUNT(*) FROM category_embeddings;

# Test similarity search function
SELECT * FROM search_similar_categories(
  (SELECT embedding FROM category_embeddings LIMIT 1),
  'USA',
  'company',
  5
);

# Check indexes
SELECT schemaname, tablename, indexname 
FROM pg_indexes 
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
```

### Migration Files

1. **000_initial_schema.sql** - Complete database schema
   - All tables (programs, categories, embeddings, users, sessions)
   - All indexes (including pgvector ivfflat index)
   - Hybrid scoring function
   - Triggers for updated_at timestamps
   - Permissions

2. **001_hybrid_scoring.sql** - Hybrid scoring function (standalone)
   - Can be applied to existing schema
   - Updates search_similar_categories function only

### Post-Migration Tasks

1. **Update Application Configuration**
   ```bash
   # Update .env file
   SUPABASE_URL=https://your-rds-endpoint.amazonaws.com
   SUPABASE_SERVICE_ROLE_KEY=your-rds-password
   ```

2. **Test Application**
   ```bash
   cd api
   npm test
   node test-service-code.js
   ```

3. **Monitor Performance**
   ```sql
   -- Check query performance
   SELECT * FROM pg_stat_statements 
   WHERE query LIKE '%search_similar_categories%'
   ORDER BY total_exec_time DESC;
   
   -- Check index usage
   SELECT * FROM pg_stat_user_indexes 
   WHERE schemaname = 'public'
   ORDER BY idx_scan DESC;
   ```

### Rollback Plan

If migration fails:

1. **Keep Supabase running** (don't delete until RDS is verified)
2. **Revert application config** to Supabase connection
3. **Debug RDS issues** without downtime
4. **Retry migration** after fixing issues

### Performance Tuning

After migration, optimize RDS:

```sql
-- Analyze tables for query planner
ANALYZE stevie_categories;
ANALYZE category_embeddings;

-- Vacuum to reclaim space
VACUUM ANALYZE;

-- Update pgvector index if needed
REINDEX INDEX idx_category_embeddings_vector;
```

### Cost Optimization

- **Instance**: Start with db.t3.medium, scale up if needed
- **Storage**: Use gp3 SSD (cheaper than gp2)
- **Backups**: 7-day retention (adjust based on needs)
- **Multi-AZ**: Enable for production (high availability)

## Notes

- All migrations are idempotent (safe to run multiple times)
- Each migration includes `DROP ... IF EXISTS` before creating
- Migrations tested on PostgreSQL 15.1
- pgvector version: 0.5.0+
