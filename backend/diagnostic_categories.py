import asyncio
from database.database import AsyncSessionLocal
from database.models import DomainCategory, FAQCategory, Domain
from sqlalchemy import select

async def run_diagnostics():
    async with AsyncSessionLocal() as db:
        print("--- Domain Category Mappings ---")
        stmt = select(DomainCategory.domain_id, Domain.domain_name, FAQCategory.faq_title).join(
            Domain, DomainCategory.domain_id == Domain.id
        ).join(
            FAQCategory, DomainCategory.category_id == FAQCategory.id
        )
        res = await db.execute(stmt)
        mappings = res.all()
        
        if not mappings:
            print("No category mappings found in domain_categories table!")
        else:
            domain_map = {}
            for row in mappings:
                domain_id, domain_name, category_title = row
                if domain_name not in domain_map:
                    domain_map[domain_name] = []
                domain_map[domain_name].append(category_title)
                
            for d_name, cats in domain_map.items():
                print(f"Domain: {d_name}")
                for c in cats:
                    print(f"  - {c}")
                    
if __name__ == "__main__":
    asyncio.run(run_diagnostics())
