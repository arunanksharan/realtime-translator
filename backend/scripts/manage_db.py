#!/usr/bin/env python3
"""
Database management script for the realtime translator
"""
import asyncio
import os
import sys
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

import sqlalchemy as sa
from app.database import create_tables, drop_tables, engine
from app.models import *  # Import all models
from loguru import logger


async def create_database_tables():
    """Create all database tables using SQLAlchemy"""
    try:
        await create_tables()
        logger.info("✅ Database tables created successfully")
    except Exception as e:
        logger.error(f"❌ Error creating database tables: {e}")
        raise


async def drop_database_tables():
    """Drop all database tables"""
    try:
        await drop_tables()
        logger.info("✅ Database tables dropped successfully")
    except Exception as e:
        logger.error(f"❌ Error dropping database tables: {e}")
        raise


async def reset_database():
    """Reset the database by dropping and recreating tables"""
    try:
        logger.info("🔄 Resetting database...")
        await drop_database_tables()
        await create_database_tables()
        logger.info("✅ Database reset successfully")
    except Exception as e:
        logger.error(f"❌ Error resetting database: {e}")
        raise


async def check_database_connection():
    """Check if the database connection is working"""
    try:
        async with engine.begin() as conn:
            await conn.execute(sa.text("SELECT 1"))
        logger.info("✅ Database connection successful")
        return True
    except Exception as e:
        logger.error(f"❌ Database connection failed: {e}")
        return False


def run_alembic_command(command: str):
    """Run an alembic command"""
    import subprocess
    
    try:
        result = subprocess.run(
            f"cd {project_root} && alembic {command}",
            shell=True,
            capture_output=True,
            text=True
        )
        
        if result.returncode == 0:
            logger.info(f"✅ Alembic command '{command}' completed successfully")
            if result.stdout:
                print(result.stdout)
        else:
            logger.error(f"❌ Alembic command '{command}' failed")
            if result.stderr:
                print(result.stderr)
            
        return result.returncode == 0
    except Exception as e:
        logger.error(f"❌ Error running alembic command: {e}")
        return False


async def main():
    """Main function to handle command line arguments"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Database management for realtime translator")
    parser.add_argument(
        "command",
        choices=["create", "drop", "reset", "check", "migrate", "upgrade", "downgrade", "revision"],
        help="Command to execute"
    )
    parser.add_argument(
        "--message", "-m",
        help="Migration message (for revision command)"
    )
    parser.add_argument(
        "--autogenerate", "-a",
        action="store_true",
        help="Auto-generate migration (for revision command)"
    )
    
    args = parser.parse_args()
    
    # Set up logging
    logger.remove()
    logger.add(sys.stdout, level="INFO", format="<green>{time:HH:mm:ss}</green> | <level>{level: <8}</level> | <cyan>{name}</cyan> - <level>{message}</level>")
    
    try:
        if args.command == "create":
            await create_database_tables()
        elif args.command == "drop":
            await drop_database_tables()
        elif args.command == "reset":
            await reset_database()
        elif args.command == "check":
            await check_database_connection()
        elif args.command == "migrate" or args.command == "upgrade":
            run_alembic_command("upgrade head")
        elif args.command == "downgrade":
            run_alembic_command("downgrade -1")
        elif args.command == "revision":
            if args.message:
                cmd = f"revision -m \"{args.message}\""
                if args.autogenerate:
                    cmd += " --autogenerate"
                run_alembic_command(cmd)
            else:
                logger.error("❌ Message is required for revision command")
                
    except KeyboardInterrupt:
        logger.info("👋 Operation cancelled by user")
    except Exception as e:
        logger.error(f"❌ Unexpected error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
