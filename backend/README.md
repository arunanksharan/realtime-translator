# Database Setup and Management

This document explains how to set up and manage the database for the realtime translator project.

## Database Models

The application uses the following database models:

### Core Models

1. **User** - Stores user information
   - `id` (String, Primary Key)
   - `email` (String, Unique)
   - `username` (String, Unique)
   - `hashed_password` (String)
   - `full_name` (String, Optional)
   - `preferred_language` (String, Optional)
   - `is_active` (Boolean)
   - `is_verified` (Boolean)
   - `created_at` (DateTime)
   - `updated_at` (DateTime)

2. **TranslationSession** - Manages translation sessions between users
   - `id` (String, Primary Key)
   - `user_a_id` (String, Foreign Key to User)
   - `user_b_id` (String, Foreign Key to User, Optional)
   - `language_a` (String) - User A's language
   - `language_b` (String) - User B's language
   - `room_url` (String) - Daily.co room URL
   - `room_name` (String) - Daily.co room name
   - `status` (Enum: created, waiting, active, completed, failed, expired)
   - `created_at`, `started_at`, `ended_at`, `expires_at` (DateTime)
   - `session_config` (Text, JSON config)
   - `error_message` (Text, Optional)

3. **Translation** - Stores individual translation records
   - `id` (String, Primary Key)
   - `session_id` (String, Foreign Key to TranslationSession)
   - `from_user_id` (String, Foreign Key to User)
   - `to_user_id` (String, Foreign Key to User)
   - `original_text` (Text)
   - `translated_text` (Text)
   - `original_language` (String)
   - `translated_language` (String)
   - `audio_duration` (Integer, milliseconds)
   - `processing_time` (Integer, milliseconds)
   - `confidence_score` (Integer, 0-100)
   - `created_at` (DateTime)

4. **SessionInvite** - Manages session invitations
   - `id` (String, Primary Key)
   - `session_id` (String, Foreign Key to TranslationSession)
   - `invited_by_id` (String, Foreign Key to User)
   - `invited_user_id` (String, Foreign Key to User, Optional)
   - `invite_email` (String, Optional)
   - `invite_code` (String, Unique)
   - `is_used` (Boolean)
   - `expires_at` (DateTime)
   - `created_at` (DateTime)
   - `used_at` (DateTime, Optional)

5. **SessionMetrics** - Stores session performance metrics
   - `id` (String, Primary Key)
   - `session_id` (String, Foreign Key to TranslationSession)
   - `avg_latency_ms`, `max_latency_ms`, `min_latency_ms` (Integer)
   - `total_translations` (Integer)
   - `total_audio_duration_ms` (Integer)
   - `avg_confidence_score` (Integer)
   - `error_count` (Integer)
   - `reconnection_count` (Integer)
   - `session_duration_ms` (Integer)
   - `created_at` (DateTime)
   - `updated_at` (DateTime)

## Database Setup

### Prerequisites

1. PostgreSQL database server running
2. Database credentials configured in `.env` file
3. Virtual environment activated

### Environment Configuration

Update your `.env` file with the correct database credentials:

```env
DATABASE_URL=postgresql+asyncpg://user:password@localhost/realtime_translator
```

### Migration Commands

The project uses Alembic for database migrations. Here are the available commands:

#### Using Alembic directly:

```bash
# Create a new migration
alembic revision -m "Your migration message"

# Create a new migration with autogenerate
alembic revision --autogenerate -m "Your migration message"

# Apply all pending migrations
alembic upgrade head

# Rollback the last migration
alembic downgrade -1

# Show current revision
alembic current

# Show migration history
alembic history
```

#### Using the management script:

```bash
# Check database connection
python scripts/manage_db.py check

# Create tables using SQLAlchemy (alternative to migrations)
python scripts/manage_db.py create

# Drop all tables
python scripts/manage_db.py drop

# Reset database (drop and recreate)
python scripts/manage_db.py reset

# Apply migrations
python scripts/manage_db.py migrate

# Create a new revision
python scripts/manage_db.py revision -m "Your message"

# Create a new revision with autogenerate
python scripts/manage_db.py revision -m "Your message" --autogenerate
```

## Initial Setup

1. **Create the database**:
   ```bash
   # Connect to PostgreSQL and create database
   psql -U postgres
   CREATE DATABASE realtime_translator;
   ```

2. **Apply initial migration**:
   ```bash
   # Run the initial migration
   alembic upgrade head
   ```

3. **Verify setup**:
   ```bash
   # Check database connection
   python scripts/manage_db.py check
   ```

## Database Architecture

The database is designed with the following relationships:

- **Users** can have multiple **TranslationSessions** (both as user_a and user_b)
- **TranslationSessions** can have multiple **Translations**
- **TranslationSessions** can have multiple **SessionInvites**
- **TranslationSessions** can have one **SessionMetrics** record
- **Users** can create and receive **SessionInvites**

## Migration Best Practices

1. **Always create migrations for schema changes** - Don't modify the database directly
2. **Review generated migrations** - Alembic's autogenerate is helpful but may miss some changes
3. **Test migrations** - Test both upgrade and downgrade paths
4. **Backup before major changes** - Always backup your database before applying migrations
5. **Use descriptive messages** - Make migration messages clear and descriptive

## Troubleshooting

### Common Issues:

1. **Connection refused**: Check if PostgreSQL is running and credentials are correct
2. **Module not found**: Ensure virtual environment is activated
3. **Migration conflicts**: Use `alembic history` to understand the current state
4. **Table already exists**: You may need to stamp the database with the current revision

### Database Reset:

If you need to completely reset the database:

```bash
# Drop all tables
python scripts/manage_db.py drop

# Apply all migrations from scratch
alembic upgrade head
```

## Performance Considerations

- **Indexes**: The migration includes indexes on frequently queried columns (email, username, invite_code)
- **Foreign Keys**: All relationships are properly constrained with foreign keys
- **UUID Primary Keys**: Using string UUIDs for distributed system compatibility
- **Nullable Fields**: Optional fields are properly marked as nullable

## Security

- **Password Hashing**: User passwords are stored as hashed values
- **User Verification**: Users have an `is_verified` flag for email verification
- **Session Expiration**: Sessions have `expires_at` timestamps
- **Invite Expiration**: Invites have `expires_at` timestamps for security
