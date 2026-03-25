import { differenceInDays, addDays } from 'date-fns';
import { supabase } from './supabase';

export const fetchRoomCountsFromDB = async (): Promise<Record<string, number>> => {
  try {
    const { data, error } = await supabase.from('room_counts').select('*');
    if (error) throw error;
    
    const counts: Record<string, number> = {};
    if (data) {
      data.forEach(row => {
        const monthStr = String(row.month).padStart(2, '0');
        counts[`${row.year}-${monthStr}`] = row.room_count;
      });
    }
    
    // If database is empty, return the default values
    if (Object.keys(counts).length === 0) {
      return {
        '2025-01': 49, '2025-02': 49, '2025-03': 93, '2025-04': 93,
        '2025-05': 93, '2025-06': 93, '2025-07': 93, '2025-08': 93,
        '2025-09': 93, '2025-10': 93, '2025-11': 93, '2025-12': 93,
      };
    }
    
    return counts;
  } catch (e) {
    console.error('Error fetching room counts:', e);
    // Fallback to defaults if table doesn't exist yet
    return {
      '2025-01': 49, '2025-02': 49, '2025-03': 93, '2025-04': 93,
      '2025-05': 93, '2025-06': 93, '2025-07': 93, '2025-08': 93,
      '2025-09': 93, '2025-10': 93, '2025-11': 93, '2025-12': 93,
    };
  }
};

export const saveRoomCountsToDB = async (counts: Record<string, number>) => {
  const upserts = Object.entries(counts).map(([key, count]) => {
    const [year, month] = key.split('-');
    return {
      year: parseInt(year),
      month: parseInt(month),
      room_count: count
    };
  });

  const { error } = await supabase
    .from('room_counts')
    .upsert(upserts, { onConflict: 'year,month' });

  if (error) throw error;
};

export const getRoomCountForDate = (date: Date, counts: Record<string, number>): number => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const key = `${year}-${month}`;
  
  if (counts[key] !== undefined) {
    return counts[key];
  }
  
  // Default fallback if not set
  return 93; 
};

export const calculateTotalAvailableRoomNights = (startDate: Date, endDate: Date, counts: Record<string, number>): number => {
  let total = 0;
  // differenceInDays is exclusive, so we add 1 to include the end date
  const days = Math.max(1, differenceInDays(endDate, startDate) + 1);
  
  for (let i = 0; i < days; i++) {
    const currentDate = addDays(startDate, i);
    total += getRoomCountForDate(currentDate, counts);
  }
  
  return total;
};
