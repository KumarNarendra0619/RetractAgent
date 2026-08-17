import requests
import json
import os

def fetch_data():
    print("Fetching retractions from OpenAlex...")
    
    # Using OpenAlex API (Polite Pool) to get retracted papers
    params = {
        "filter": "is_retracted:true",
        "select": "doi,title,publisher,publication_year,authorships",
        "per_page": 200,
        "cursor": "*",
        "mailto": "admin@learnovaindia.org" # Replace with your email for faster API access
    }
    
    data = []
    
    while params["cursor"]:
        try:
            response = requests.get("https://api.openalex.org/works", params=params)
            if response.status_code != 200:
                print(f"Error fetching data: {response.status_code}")
                break
                
            res_json = response.json()
            results = res_json.get("results", [])
            
            if not results:
                break
                
            for item in results:
                # Extract and deduplicate university names
                institutions = []
                for authorship in item.get("authorships", []):
                    for inst in authorship.get("institutions", []):
                        inst_name = inst.get("display_name")
                        if inst_name and inst_name not in institutions:
                            institutions.append(inst_name)
                            
                # Create a clean, compressed record
                clean_item = {
                    "doi": item.get("doi"),
                    "title": item.get("title"),
                    "publisher": item.get("publisher"),
                    "year": item.get("publication_year"),
                    "institutions": institutions
                }
                data.append(clean_item)
                
            # Get the next page cursor
            params["cursor"] = res_json.get("meta", {}).get("next_cursor")
            print(f"Fetched {len(data)} records so far...")
            
            # Limit to 1000 records initially to keep the GitHub Action fast
            if len(data) >= 1000:
                print("Reached 1000 records limit for initial setup.")
                break
                
        except Exception as e:
            print(f"Connection error: {e}")
            break

    # Create data folder if it doesn't exist
    os.makedirs("data", exist_ok=True)
    
    # Save the JSON file
    with open("data/retractions.json", 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, separators=(',', ':'))
        
    print(f"Successfully saved {len(data)} retracted articles to data/retractions.json")

if __name__ == "__main__":
    fetch_data()
