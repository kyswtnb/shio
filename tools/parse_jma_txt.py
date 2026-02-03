
import json
import sys
import os
import re

def parse_line(line):
    # Standard format: hourly data in columns 1-72, metadata starts at index 72
    if len(line) < 80:
        line = line.rjust(80)

    # Clean the line from any trailing garbage/newlines
    line = line.rstrip('\r\n')
    if len(line) < 80:
        line = line.ljust(80)

    # Hourly data: columns 1-72 (24 values * 3 chars)
    # JMA format: [HH1][HH2]...[HH24] 
    # Each is 3 characters wide.
    hourly_raw = line[0:72]
    
    # Metadata starts at column 73 (0-indexed 72)
    # Format: YY(73-74), MM(75-76), DD(77-78), Station(79-80)
    yy = line[72:74].strip()
    mm = line[74:76].strip()
    dd = line[76:78].strip()
    station = line[78:80].strip()

    # Re-verify if this looks like a date. Year 2026 is '26'.
    if not (yy.isdigit() and mm.isdigit() and dd.isdigit()):
        # Try a more flexible regex anchor if fixed width fails (e.g. if spaces were shifted)
        # Look for the date/station pattern from the right
        match = re.search(r'(\d{2})\s+(\d{1,2})\s+(\d{1,2})([A-Z0-9]{2})$', line)
        if match:
            yy, mm, dd, station = match.groups()
            hourly_raw = line[:match.start()].rjust(72)
        else:
            return None

    hourly = []
    for i in range(0, 72, 3):
        chunk = hourly_raw[i:i+3].strip()
        if chunk == "":
            hourly.append(None)
            continue
        try:
            # JMA values are in cm
            hourly.append(int(chunk))
        except ValueError:
            # Handle smashed values or weird characters
            nums = re.findall(r'-?\d+', chunk)
            if nums:
                hourly.append(int(nums[0]))
            else:
                hourly.append(None)
                
    if len(hourly) == 24:
        # Check if we have at least some data
        if all(x is None for x in hourly):
            return None
            
        try:
            yy_val = int(yy)
            mm_val = int(mm)
            dd_val = int(dd)
            # Basic sanity check for year 26
            if yy_val != 26: 
                # If it's not 26, maybe it's 25 or something else, but we target 2026
                # JMA files sometimes have a couple of days from prev/next months
                pass
            
            return {
                "date": f"20{yy_val:02d}-{mm_val:02d}-{dd_val:02d}",
                "station": station,
                "hourly": hourly
            }
        except ValueError:
            return None
    
    return None

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python parse_jma_txt.py <input_file> [<output_file>]")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else input_file.replace('.txt', '.json')
    
    data = []
    try:
        with open(input_file, 'r', encoding='utf-8') as f:
            for line in f:
                parsed = parse_line(line)
                if parsed:
                    data.append(parsed)
        
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        print(f"Successfully parsed {len(data)} days to {output_file}")
    except Exception as e:
        print(f"Error: {e}")

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
