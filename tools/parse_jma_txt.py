import json
import sys
import os
import re

def parse_line(line):
    # Standard line is ~80 chars plus a lot of data after column 80 (metadata)
    # But let's focus on the first 80 columns.
    if len(line) < 80:
        # If the line is short, it's missing leading spaces.
        line = line.rjust(80)

    # Hourly data: columns 1-72 (24 values * 3 chars)
    # In 0-indexed: line[0:72]
    hourly_raw = line[0:72]
    
    # Metadata starts at column 73 (index 72)
    # Format: YY(73-74), MM(75-76), DD(77-78), Station(79-80)
    # Note: browser fetch might have shifted these if internal spaces were collapsed.
    # However, the station code and date are usually the 'anchor' at columns 73-80.
    
    yy = line[72:74].strip()
    mm = line[74:76].strip()
    dd = line[76:78].strip()
    station = line[78:80].strip()

    # Re-verify if this looks like a date. YY=26.
    if yy != '26' or not mm.isdigit() or not dd.isdigit():
        # Fallback: search for station code and work backwards
        # Station codes we expect: TK, OS, NG, QS
        match = re.search(r'(26)\s*(\d{1,2})\s*(\d{1,2})(TK|OS|NG|QS)', line)
        if match:
            yy, mm, dd, station = match.groups()
            # Everything before match is hourly
            hourly_raw = line[:match.start()].rjust(72)
        else:
            return None

    hourly = []
    for i in range(0, 72, 3):
        chunk = hourly_raw[i:i+3].strip()
        if chunk == "":
            # Handle cases where value might be missing but we expect 24
            # Usually JMA uses 999 or similar if missing, but browser might have empty.
            hourly.append(None)
            continue
        try:
            hourly.append(int(chunk))
        except ValueError:
            # Shifted data? try regex fallback for this chunk
            nums = re.findall(r'-?\d+', chunk)
            if nums:
                hourly.append(int(nums[0]))
            else:
                hourly.append(None)
                
    if len(hourly) == 24:
        yy_full = 2000 + int(yy)
        return {
            "date": f"{yy_full}-{int(mm):02d}-{int(dd):02d}",
            "station": station,
            "hourly": hourly
        }
    
    return None

def main():
    if len(sys.argv) < 3:
        print("Usage: python3 parse_jma_txt.py <input.txt> <output.json>")
        return

    input_path = sys.argv[1]
    output_path = sys.argv[2]
    
    results = []
    if not os.path.exists(input_path):
        print(f"Error: {input_path} not found.")
        return

    print(f"Parsing {input_path}...")
    with open(input_path, 'r') as f:
        for line in f:
            line = line.rstrip('\r\n')
            if not line.strip(): continue
            parsed = parse_line(line)
            if parsed:
                results.append(parsed)
    
    # Sort by date
    results.sort(key=lambda x: x['date'])
    
    print(f"Successfully parsed {len(results)} days.")
    
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, 'w') as f:
        json.dump(results, f, indent=2, ensure_ascii=False)
    
    print(f"Saved to {output_path}")

if __name__ == "__main__":
    main()
