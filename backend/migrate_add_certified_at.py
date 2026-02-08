"""
DB 마이그레이션: weekly_status 테이블에 certified_date, certified_at 컬럼 추가
"""
import sqlite3
import sys
from pathlib import Path

# DB 경로
DB_PATH = Path(__file__).parent.parent / "corgi_check.db"

def migrate():
    if not DB_PATH.exists():
        print(f"DB 파일을 찾을 수 없습니다: {DB_PATH}")
        return

    conn = sqlite3.connect(str(DB_PATH))
    cursor = conn.cursor()

    try:
        # 컬럼 존재 여부 확인
        cursor.execute("PRAGMA table_info(weekly_status)")
        columns = [row[1] for row in cursor.fetchall()]

        # certified_date 컬럼 추가
        if 'certified_date' not in columns:
            print("certified_date 컬럼 추가 중...")
            cursor.execute("ALTER TABLE weekly_status ADD COLUMN certified_date TEXT")
            print("certified_date 컬럼 추가 완료")
        else:
            print("certified_date 컬럼이 이미 존재합니다.")

        # certified_at 컬럼 추가
        if 'certified_at' not in columns:
            print("certified_at 컬럼 추가 중...")
            cursor.execute("ALTER TABLE weekly_status ADD COLUMN certified_at TEXT")
            print("certified_at 컬럼 추가 완료")
        else:
            print("certified_at 컬럼이 이미 존재합니다.")

        conn.commit()
        print("마이그레이션 완료!")

    except Exception as e:
        print(f"마이그레이션 실패: {e}")
        conn.rollback()
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    migrate()
