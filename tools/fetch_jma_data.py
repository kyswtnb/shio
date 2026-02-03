import urllib.request
import json
import os
import time

# JMA Text Data URL Pattern
BASE_URL = "https://www.data.jma.go.jp/kaiyou/data/db/tide/suisan/txt/2026"

# Verified Station Codes (from JMA website inspection)
# Tokyo=TK, Osaka=OS, Nagoya=NG, Yokohama=QS, Kobe=KB
# Hakata=QF, Otaru=NA (Wait, Otaru is not in the list I found?
# Let's use the ones I confirmed:
# Tokyo=TK, Osaka=OS, Nagoya=NG, Yokohama=QS, Kobe=KB
# Hakata=QF, Nagasaki=NS, Kagoshima=KG, Naha=NH
# Sendai=SD, Hiroshima=Q8, Niigata=S6
STATIONS = [
    {"code": "TK", "name": "Tokyo", "id": "tokyo"},
    {"code": "OS", "name": "Osaka", "id": "osaka"},
    {"code": "NG", "name": "Nagoya", "id": "nagoya"},
    {"code": "QS", "name": "Yokohama", "id": "yokohama"},
    {"code": "KB", "name": "Kobe", "id": "kobe"},
    {"code": "QF", "name": "Hakata", "id": "fukuoka"}, 
    {"code": "NH", "name": "Naha", "id": "naha"},
    {"code": "Q8", "name": "Hiroshima", "id": "hiroshima"},
    {"code": "SD", "name": "Sendai", "id": "sendai"},
    {"code": "KG", "name": "Kagoshima", "id": "kagoshima"},
    {"code": "S6", "name": "Niigata", "id": "niigata"}
]

# Note: Otaru was not found in my quick scan, omitting for now to be safe.
# Sapporo is inland, Otaru is the port.
# If Otaru code is unknown, I will skip it.

OUTPUT_FILE = "../data/tide_2026.json"

def fetch_data(station_code):
    url = f"{BASE_URL}/{station_code}.txt"
    try:
        # Use a user agent to avoid being blocked
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
        }
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req) as response:
            return response.read().decode('utf-8')
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return None

def parse_line(line, station_code):
    try:
        parts = line.split()
        if len(parts) < 26: return None
        
        # Last part validation usually ends with Code
        # Example: ... 19 26 1 5TK
        last_part = parts[-1]
        
        # Some codes like Q8 might be parsed differently if they contain numbers?
        # But usually format is consistent.
        
        # YEAR: parts[-4] -> "26"
        year_short = parts[-4]
        if len(year_short) != 2: return None
        year = "20" + year_short
        
        # MONTH: parts[-3]
        month = parts[-3].zfill(2)
        
        # DAY: attached to code in last part
        # "5TK" -> day=5. "15TK" -> day=15.
        # "5Q8" -> day=5?
        
        if station_code in last_part:
            day_str = last_part.replace(station_code, "")
            if not day_str.isdigit(): return None
            day = day_str.zfill(2)
        else:
            # Maybe slight format variation?
            return None
            
        date_str = f"{year}-{month}-{day}"
        
        hours = []
        # First 24 items are hourly tide levels
        for i in range(24):
            hours.append(int(parts[i]))
            
        return {
            "date": date_str,
            "hours": hours
        }
    except Exception as e:
        return None

def main():
    all_data = {}
    abs_output = os.path.abspath(os.path.join(os.path.dirname(__file__), OUTPUT_FILE))
    os.makedirs(os.path.dirname(abs_output), exist_ok=True)
    
    success_count = 0
    
    for station in STATIONS:
        print(f"Fetching {station['name']} ({station['code']})...")
        raw_text = fetch_data(station['code'])
        
        if not raw_text:
            print(f"  > FAILED {station['code']}")
            continue
            
        station_data = {}
        lines = raw_text.splitlines()
        
        for line in lines:
            parsed = parse_line(line, station['code'])
            if parsed:
                station_data[parsed['date']] = parsed['hours']
                
        if station_data:
             all_data[station['id']] = station_data
             print(f"  > Parsed {len(station_data)} days.")
             success_count += 1
        else:
             print("  > No data parsed.")

    if success_count > 0:
        with open(abs_output, 'w') as f:
            json.dump(all_data, f, indent=0)
        print(f"Saved {success_count} stations to {abs_output}")
    else:
        print("No stations fetched successfully.")

if __name__ == "__main__":
    main()
