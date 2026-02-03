
import os
import json
import urllib.request
import urllib.error
import re
from parse_jma_txt import parse_line

STATION_LIST_URL = "https://www.data.jma.go.jp/kaiyou/db/tide/suisan/station.php"
BASE_DATA_URL = "https://www.data.jma.go.jp/kaiyou/data/db/tide/suisan/txt/2026/{code}.txt"

DATA_TXT_DIR = "data/raw_txt"
DATA_JSON_DIR = "data/raw"

def get_html(url):
    try:
        with urllib.request.urlopen(url, timeout=20) as response:
            return response.read().decode('utf-8', errors='replace')
    except Exception as e:
        print(f"Error fetching {url}: {e}")
        return None

def scrape_stations():
    print(f"Scraping stations from {STATION_LIST_URL}...")
    html = get_html(STATION_LIST_URL)
    if not html:
        return []
    
    stations_map = {}
    current_pref = "不明"
    
    # Method 1: Table-based extraction (better for capturing prefectures)
    rows = re.findall(r'<tr[^>]*>(.*?)</tr>', html, re.DOTALL)
    for row in rows:
        cells = re.findall(r'<td[^>]*>(.*?)</td>', row, re.DOTALL)
        if len(cells) >= 3:
            # First cell might be the prefecture/region name
            pref_raw = re.sub(r'<[^>]+>', '', cells[0]).strip()
            if pref_raw:
                current_pref = pref_raw
            
            code = re.sub(r'<[^>]+>', '', cells[1]).strip()
            name = re.sub(r'<[^>]+>', '', cells[2]).strip()
            
            if code and name and len(code) == 2 and code.isupper():
                if code != '地点記号':
                    stations_map[code] = {"code": code, "name": name, "pref": current_pref}

    # Method 2: Link-based fallback (if Method 1 finds < 10 stations)
    if len(stations_map) < 10:
        print("Table scraping found few stations. Using link-based fallback...")
        links = re.findall(r'suisan\.php\?stn=([A-Z0-9]{2})[^>]*>(.*?)</a>', html)
        for code, name in links:
            name = name.strip()
            if code and name and name != "潮汐表":
                stations_map[code] = {"code": code, "name": name, "pref": "不明"}

    stations = list(stations_map.values())
    # Sort by prefecture then name
    stations.sort(key=lambda x: (x['pref'], x['name']))
    
    print(f"Found {len(stations)} stations.")
    return stations

def download_data(code):
    url = BASE_DATA_URL.format(code=code)
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            if response.status == 200:
                content = response.read().decode('utf-8', errors='replace')
                path = os.path.join(DATA_TXT_DIR, f"{code}.txt")
                with open(path, 'w', encoding='utf-8') as f:
                    f.write(content)
                return True
    except urllib.error.HTTPError as e:
        print(f"HTTP Error for {code}: {e.code}")
    except Exception as e:
        print(f"Exception downloading {code}: {e}")
    return False

def process_all_stations(stations):
    os.makedirs(DATA_TXT_DIR, exist_ok=True)
    os.makedirs(DATA_JSON_DIR, exist_ok=True)
    
    processed_stations = []
    
    for i, st in enumerate(stations):
        code = st['code']
        name = st['name']
        print(f"[{i+1}/{len(stations)}] Processing {name} ({code})...")
        
        if download_data(code):
            txt_path = os.path.join(DATA_TXT_DIR, f"{code}.txt")
            json_path = os.path.join(DATA_JSON_DIR, f"{code}.json")
            
            data = []
            try:
                with open(txt_path, 'r', encoding='utf-8') as f:
                    for line in f:
                        parsed = parse_line(line)
                        if parsed:
                            data.append(parsed)
                
                if data:
                    with open(json_path, 'w', encoding='utf-8') as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
                    processed_stations.append(st)
                else:
                    print(f"Warning: No data parsed for {code}")
            except Exception as e:
                print(f"Error processing {code}: {e}")
        
    return processed_stations

if __name__ == "__main__":
    stations = scrape_stations()
    if stations:
        os.makedirs('data', exist_ok=True)
        with open('data/stations.json', 'w', encoding='utf-8') as f:
            json.dump(stations, f, ensure_ascii=False, indent=2)
            
        print("Starting batch processing...")
        process_all_stations(stations)
        print("Batch processing complete.")
    else:
        print("No stations found. Check the regex or URL.")
        import sys
        sys.exit(1)
