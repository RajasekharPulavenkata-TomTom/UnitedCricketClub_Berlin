"""
API-test-specific fixtures.
`clean_tables` runs after every API test to keep the DB pristine.
"""
import pytest


@pytest.fixture(autouse=True)
def clean_tables(engine):
    yield
    from database import Base
    with engine.begin() as conn:
        # Delete in reverse dependency order to avoid FK violations
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
