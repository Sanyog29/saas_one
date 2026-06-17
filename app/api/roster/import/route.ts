import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/frontend/utils/supabase/server';
import * as ExcelJS from 'exceljs';

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get('file') as File;
        const propertyId = request.nextUrl.searchParams.get('propertyId');

        if (!file || !propertyId) {
            return NextResponse.json({ error: 'File and propertyId are required' }, { status: 400 });
        }

        const buffer = await file.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const worksheet = workbook.worksheets[0];

        if (!worksheet) {
            return NextResponse.json({ error: 'No worksheet found in file' }, { status: 400 });
        }

        const supabase = await createClient();

        // 1. Fetch Shift Configurations
        const { data: configs } = await supabase
            .from('shift_configurations')
            .select('*')
            .eq('property_id', propertyId);

        if (!configs) {
            return NextResponse.json({ error: 'No shift configurations found' }, { status: 400 });
        }

        // 2. Fetch Staff (registered and offline) to map names to IDs
        const { data: registeredStaff } = await supabase
            .from('property_memberships')
            .select(`user_id, users(full_name)`)
            .eq('property_id', propertyId)
            .eq('is_active', true);

        const { data: offlineStaff } = await supabase
            .from('offline_roster_staff')
            .select('id, full_name')
            .eq('property_id', propertyId);

        const staffMap = new Map<string, string>(); // name (lowercase) -> user_id
        registeredStaff?.forEach((s: any) => {
            const userObj = Array.isArray(s.users) ? s.users[0] : s.users;
            if (userObj?.full_name) staffMap.set(userObj.full_name.trim().toLowerCase(), s.user_id);
        });
        offlineStaff?.forEach(s => {
            if (s.full_name) staffMap.set(s.full_name.trim().toLowerCase(), s.id);
        });

        // 3. Parse Excel Layout dynamically
        const fallbackYear = parseInt(request.nextUrl.searchParams.get('year') || new Date().getFullYear().toString());
        const fallbackMonth = parseInt(request.nextUrl.searchParams.get('month') || (new Date().getMonth() + 1).toString());

        let headerRowNumber = 1;
        let nameColNumber = 1; // default to Column A
        let headerRow = worksheet.getRow(1);
        
        const getCellValue = (cell: any) => {
            if (!cell) return '';
            const val = cell.value;
            if (val === null || val === undefined) return '';
            
            if (typeof val === 'object') {
                if (val instanceof Date) return val.toISOString();
                if (val.richText) return val.richText.map((rt: any) => rt.text || '').join('');
                if (val.result !== undefined) return String(val.result);
                if (val.text !== undefined) return String(val.text);
                return ''; // Safe fallback
            }
            return String(val);
        };

        let maxDatesFound = 0;
        let bestDates: { col: number; dateStr: string }[] = [];
        let bestDebugVals: any[] = [];
        
        // Scan up to row 10 to find the row with the most dates (this is the true header row)
        for (let i = 1; i <= 10; i++) {
            const row = worksheet.getRow(i);
            const tempDates: { col: number; dateStr: string }[] = [];
            const tempDebugVals: any[] = [];
            let tempNameCol = 1; // Default to column 1

            row.eachCell((cell, colNum) => {
                const val = getCellValue(cell).trim();
                if (!val) return;
                tempDebugVals.push(val);

                const lowerVal = val.toLowerCase();
                if (lowerVal === 'name' || lowerVal === 'staff name' || lowerVal === 'employee name') {
                    tempNameCol = colNum;
                }

                // Check if this cell is a valid date
                let foundDateStr = null;
                if (cell.type === ExcelJS.ValueType.Date || cell.value instanceof Date) {
                    const dateObj = new Date(cell.value as any);
                    if (!isNaN(dateObj.getTime())) {
                        const yyyy = dateObj.getFullYear();
                        const mm = (dateObj.getMonth() + 1).toString().padStart(2, '0');
                        const dd = dateObj.getDate().toString().padStart(2, '0');
                        foundDateStr = `${yyyy}-${mm}-${dd}`;
                    }
                } else {
                    const match1 = val.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
                    if (match1) foundDateStr = `${match1[3]}-${match1[2]}-${match1[1]}`;
                    else {
                        const match2 = val.match(/^(\d{4})[./-](\d{2})[./-](\d{2})$/);
                        if (match2) foundDateStr = `${match2[1]}-${match2[2]}-${match2[3]}`;
                        else {
                            const customDayMatch = val.match(/^(\d{1,2})(\s.*|\n.*)?$/);
                            if (customDayMatch) {
                                const dayNum = parseInt(customDayMatch[1]);
                                if (dayNum >= 1 && dayNum <= 31) {
                                    const yyyy = fallbackYear;
                                    const mm = fallbackMonth.toString().padStart(2, '0');
                                    const dd = dayNum.toString().padStart(2, '0');
                                    foundDateStr = `${yyyy}-${mm}-${dd}`;
                                }
                            } else {
                                const parsed = new Date(val);
                                // Ensure it's a realistic date and not just a random number parsed as a weird year
                                if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000 && parsed.getFullYear() < 2100) {
                                    const yyyy = parsed.getFullYear();
                                    const mm = (parsed.getMonth() + 1).toString().padStart(2, '0');
                                    const dd = parsed.getDate().toString().padStart(2, '0');
                                    foundDateStr = `${yyyy}-${mm}-${dd}`;
                                }
                            }
                        }
                    }
                }

                if (foundDateStr) {
                    tempDates.push({ col: colNum, dateStr: foundDateStr });
                }
            });

            if (tempDates.length > maxDatesFound) {
                maxDatesFound = tempDates.length;
                headerRowNumber = i;
                headerRow = row;
                bestDates = tempDates;
                bestDebugVals = tempDebugVals;
                nameColNumber = tempNameCol;
            }
        }

        const dates = bestDates;
        const debugVals = bestDebugVals;

        if (dates.length === 0) {
            return NextResponse.json({ 
                error: `Could not detect any valid dates in Row ${headerRowNumber}. Debug Info: [${debugVals.join(', ')}]` 
            }, { status: 400 });
        }

        const assignments: any[] = [];
        const unknownNames: string[] = [];
        const unknownShifts: string[] = [];

        const processRowAssignments = (userId: string, row: any, dates: any[], configs: any[], assignments: any[], unknownShifts: string[]) => {
            dates.forEach(d => {
                const shiftVal = getCellValue(row.getCell(d.col)).trim();
                if (!shiftVal) return; // Empty cell

                // First, check if the cell value exactly matches a shift code (e.g., 'A', 'B', 'W/O')
                let shiftId = configs.find(c => c.code.toUpperCase() === shiftVal.toUpperCase())?.id;

                // If not found, check if it's a timing string (e.g., "09:00 to 18:00" or "09:00 - 18:00") and try to match it
                if (!shiftId) {
                    const timeMatch = shiftVal.match(/(\d{1,2}[:.]\d{2})\s*(?:to|-)\s*(\d{1,2}[:.]\d{2})/i);
                    if (timeMatch) {
                        const formatTimeStr = (t: string) => {
                            const clean = t.replace('.', ':').replace(/[^0-9:]/g, '');
                            const parts = clean.split(':');
                            if (parts.length >= 2) return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}:00`;
                            return null;
                        };
                        const start = formatTimeStr(timeMatch[1]);
                        const end = formatTimeStr(timeMatch[2]);
                        
                        if (start && end) {
                            // Find an exact match by start and end time
                            shiftId = configs.find(c => c.start_time === start && c.end_time === end)?.id;
                            
                            if (!shiftId) {
                                // Will auto-create a shift config with this format
                                assignments.push({
                                    user_id: userId,
                                    roster_date: d.dateStr,
                                    shift_id: null,
                                    _temp_start: start,
                                    _temp_end: end,
                                    is_reliever: false
                                });
                                return; // Skip normal assignment push
                            }
                        }
                    }
                }
                
                // Special edge case check for "Leave"
                if (!shiftId && ['L', 'LEAVE', 'LV'].includes(shiftVal.toUpperCase())) {
                     shiftId = configs.find(c => c.code.toUpperCase() === 'L' || c.code.toUpperCase() === 'LEAVE' || c.name.toUpperCase().includes('LEAVE'))?.id;
                }

                // Special edge case check for "Week Off"
                if (!shiftId && ['W/O', 'WO', 'W-O', 'WEEK OFF', 'WEEKOFF', 'OFF'].includes(shiftVal.toUpperCase())) {
                     shiftId = configs.find(c => ['W/O', 'WO', 'OFF'].includes(c.code.toUpperCase()) || c.name.toUpperCase().includes('OFF'))?.id;
                }

                if (shiftId) {
                    assignments.push({
                        user_id: userId,
                        roster_date: d.dateStr,
                        shift_id: shiftId,
                        is_reliever: false
                    });
                } else {
                    if (!unknownShifts.includes(shiftVal)) unknownShifts.push(shiftVal);
                }
            });
        };

        // 4. Iterate through rows
        let currentDesignation = 'Staff';
        const missingStaffRows: any[] = []; // Store rows that need staff creation

        worksheet.eachRow((row, rowNumber) => {
            if (rowNumber <= headerRowNumber) return; // Skip headers

            const nameCell = getCellValue(row.getCell(nameColNumber)).trim();
            if (!nameCell) return;

            // If the row is ALL CAPS (and not a time string), it's likely a designation header
            if (nameCell.toUpperCase() === nameCell && nameCell.length > 3 && !nameCell.includes('AM to') && !nameCell.includes('PM to') && !['DAY', 'DATE'].includes(nameCell)) {
                currentDesignation = nameCell;
                return;
            }

            let userId = staffMap.get(nameCell.toLowerCase());
            
            if (!userId) {
                // Fallback: Fuzzy matching
                const normalize = (s: string) => s.replace(/[^a-z]/gi, '').toLowerCase();
                const normalizedCellName = normalize(nameCell);
                
                let bestMatchId = null;
                let highestSimilarity = 0;

                Array.from(staffMap.entries()).forEach(([staffName, id]) => {
                    const normStaff = normalize(staffName);
                    if (normStaff.includes(normalizedCellName) || normalizedCellName.includes(normStaff)) {
                        const similarity = Math.min(normStaff.length, normalizedCellName.length) / Math.max(normStaff.length, normalizedCellName.length);
                        if (similarity > highestSimilarity) {
                            highestSimilarity = similarity;
                            bestMatchId = id;
                        }
                    }
                    
                    let matches = 0;
                    for (let i = 0; i < Math.min(normStaff.length, normalizedCellName.length); i++) {
                        if (normStaff[i] === normalizedCellName[i]) matches++;
                    }
                    const ratio = matches / Math.max(normStaff.length, normalizedCellName.length);
                    if (ratio > 0.8 && ratio > highestSimilarity) {
                        highestSimilarity = ratio;
                        bestMatchId = id;
                    }
                });

                if (bestMatchId && highestSimilarity > 0.5) {
                    userId = bestMatchId;
                }
            }

            if (!userId) {
                // We will auto-create this user as an offline staff member
                unknownNames.push(nameCell);
                missingStaffRows.push({
                    nameCell,
                    designation: currentDesignation,
                    row,
                    dates: bestDates
                });
                return; // We'll process their assignments after creation
            }

            // Normal processing for existing users
            processRowAssignments(userId, row, bestDates, configs, assignments, unknownShifts);
        });

        // Auto-create missing staff as offline staff
        if (missingStaffRows.length > 0) {
            // Deduplicate names to create
            const uniqueMissing = Array.from(new Set(missingStaffRows.map(m => m.nameCell)));
            const newOfflineStaffToInsert = uniqueMissing.map(name => {
                const match = missingStaffRows.find(m => m.nameCell === name);
                return {
                    property_id: propertyId,
                    full_name: name,
                    custom_designation: match?.designation || 'Staff'
                };
            });

            const { data: insertedStaff, error: staffError } = await supabase
                .from('offline_roster_staff')
                .insert(newOfflineStaffToInsert)
                .select();

            if (!staffError && insertedStaff) {
                // Now process the assignments for the newly created staff
                missingStaffRows.forEach(m => {
                    const created = insertedStaff.find((s: any) => s.full_name === m.nameCell);
                    if (created) {
                        processRowAssignments(created.id, m.row, m.dates, configs, assignments, unknownShifts);
                    }
                });
            } else {
                console.error('[POST /api/roster/import] Failed to auto-create staff:', staffError);
            }
        }



        // Resolve new time slots by creating shift configurations
        const tempAssignments = assignments.filter((a: any) => a._temp_start && a._temp_end);
        
        // Ensure uniqueness by creating a Set of combined "start|end"
        const uniqueTimesMap = new Map<string, { start: string, end: string }>();
        tempAssignments.forEach(a => {
            const key = `${a._temp_start}|${a._temp_end}`;
            if (!uniqueTimesMap.has(key)) {
                uniqueTimesMap.set(key, { start: a._temp_start, end: a._temp_end });
            }
        });
        
        const newConfigsToInsert = Array.from(uniqueTimesMap.values()).map(val => {
            const codeName = `${val.start.slice(0, 5)} to ${val.end.slice(0, 5)}`;
            return {
                property_id: propertyId,
                code: codeName.substring(0, 20),
                name: codeName,
                start_time: val.start,
                end_time: val.end,
                color: '#cbd5e1', // A neutral slate color for auto-generated shifts
                is_working_day: true
            };
        });

        if (newConfigsToInsert.length > 0) {
            // Use admin client or regular supabase client to insert
            const { data: insertedConfigs, error: insertError } = await supabase
                .from('shift_configurations')
                .upsert(newConfigsToInsert, { onConflict: 'property_id,code' })
                .select();
            
            if (insertError) {
                console.error('[POST /api/roster/import] Failed to insert new shifts:', insertError);
            } else if (insertedConfigs) {
                // Now map the newly inserted config IDs back to the temp assignments
                // Note: upsert might return multiple or single row, but we use .select() so we get the rows.
                tempAssignments.forEach((a: any) => {
                    const matchedConfig = insertedConfigs.find(
                        c => c.start_time === a._temp_start && c.end_time === a._temp_end
                    );
                    if (matchedConfig) {
                        a.shift_id = matchedConfig.id;
                    }
                    // Clean up temp props
                    delete a._temp_start;
                    delete a._temp_end;
                });
            }
        }

        // Filter out any assignments that failed to resolve a shift_id
        const finalAssignments = assignments.filter((a: any) => a.shift_id !== null);

        return NextResponse.json({
            success: true,
            assignments: finalAssignments,
            stats: {
                totalImported: finalAssignments.length,
                unknownNames: Array.from(new Set(unknownNames)),
                unknownShifts: Array.from(new Set(unknownShifts))
            }
        });

    } catch (error) {
        console.error('[POST /api/roster/import] API error:', error);
        return NextResponse.json({ error: 'Failed to process file' }, { status: 500 });
    }
}
