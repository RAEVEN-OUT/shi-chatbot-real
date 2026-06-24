export function formatDate(dateString, customTimeStamp) {
  if (!dateString) return 'N/A';
  
  try {
    let dateStr = dateString;
    // Replace space with T to ensure valid ISO format, then append 'Z' if missing
    if (typeof dateStr === 'string') {
      dateStr = dateStr.replace(' ', 'T');
      if (!dateStr.endsWith('Z') && !dateStr.includes('+')) {
        dateStr += 'Z';
      }
    }
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'Invalid Date';

    const formatterOptions = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    };

    let tzValid = true;
    if (customTimeStamp) {
      try {
        // Validate timezone
        Intl.DateTimeFormat(undefined, {timeZone: customTimeStamp});
        formatterOptions.timeZone = customTimeStamp;
      } catch (e) {
        console.warn(`Invalid timezone: ${customTimeStamp}`, e);
        tzValid = false;
      }
    }

    const formatter = new Intl.DateTimeFormat('en-GB', formatterOptions);
    const parts = formatter.formatToParts(date);
    
    const p = {};
    for (const part of parts) {
      p[part.type] = part.value;
    }
    
    // Some browsers might return 24 instead of 00 for midnight when hour12=false
    let hour = p.hour;
    if (hour === '24') hour = '00';

    return `${p.day}-${p.month}-${p.year} ${hour}:${p.minute}:${p.second}`;
  } catch (error) {
    return String(dateString);
  }
}

export function formatTime(dateString, customTimeStamp) {
  if (!dateString) return 'N/A';
  
  try {
    let dateStr = dateString;
    // Replace space with T to ensure valid ISO format, then append 'Z' if missing
    if (typeof dateStr === 'string') {
      dateStr = dateStr.replace(' ', 'T');
      if (!dateStr.endsWith('Z') && !dateStr.includes('+')) {
        dateStr += 'Z';
      }
    }
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 'Invalid Time';

    const formatterOptions = {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    };

    if (customTimeStamp) {
      try {
        // Validate timezone
        Intl.DateTimeFormat(undefined, {timeZone: customTimeStamp});
        formatterOptions.timeZone = customTimeStamp;
      } catch (e) {
        console.warn(`Invalid timezone: ${customTimeStamp}`, e);
      }
    }

    const formatter = new Intl.DateTimeFormat('en-GB', formatterOptions);
    const parts = formatter.formatToParts(date);
    
    const p = {};
    for (const part of parts) {
      p[part.type] = part.value;
    }
    
    // Some browsers might return 24 instead of 00 for midnight when hour12=false
    let hour = p.hour;
    if (hour === '24') hour = '00';

    return `${hour}:${p.minute}`;
  } catch (error) {
    return 'N/A';
  }
}
