/**
 * Geography Mapper
 * Maps user-provided location names to database geography values
 * 
 * Database geography values (consolidated):
 * - Global: Available worldwide
 * - USA: United States only
 * - Asia-Pacific: Asia-Pacific region (India, China, Japan, etc.)
 * - MENA: Middle East & North Africa
 * - DACH: Germany, Austria, Switzerland
 */

export type NominationScope = 'regional' | 'global' | 'both' | 'all';

export class GeographyMapper {
  private static readonly GEOGRAPHY_MAP: Record<string, string[]> = {
    // Asia-Pacific
    'india': ['Asia-Pacific'],
    'china': ['Asia-Pacific'],
    'japan': ['Asia-Pacific'],
    'singapore': ['Asia-Pacific'],
    'australia': ['Asia-Pacific'],
    'new zealand': ['Asia-Pacific'],
    'south korea': ['Asia-Pacific'],
    'korea': ['Asia-Pacific'],
    'thailand': ['Asia-Pacific'],
    'vietnam': ['Asia-Pacific'],
    'indonesia': ['Asia-Pacific'],
    'malaysia': ['Asia-Pacific'],
    'philippines': ['Asia-Pacific'],
    'pakistan': ['Asia-Pacific'],
    'bangladesh': ['Asia-Pacific'],
    'sri lanka': ['Asia-Pacific'],
    'taiwan': ['Asia-Pacific'],
    'hong kong': ['Asia-Pacific'],
    
    // USA
    'united states': ['USA'],
    'usa': ['USA'],
    'us': ['USA'],
    'america': ['USA'],
    
    // Middle East & North Africa
    'uae': ['MENA'],
    'united arab emirates': ['MENA'],
    'dubai': ['MENA'],
    'saudi arabia': ['MENA'],
    'qatar': ['MENA'],
    'kuwait': ['MENA'],
    'bahrain': ['MENA'],
    'oman': ['MENA'],
    'israel': ['MENA'],
    'jordan': ['MENA'],
    'lebanon': ['MENA'],
    'egypt': ['MENA'],
    'morocco': ['MENA'],
    'tunisia': ['MENA'],
    'algeria': ['MENA'],
    'libya': ['MENA'],
    
    // German-speaking region
    'germany': ['DACH'],
    'austria': ['DACH'],
    'switzerland': ['DACH'],
  };
  
  /**
   * Map user-provided geography to database values
   * @param userInput - User's location (e.g., "India", "New York", "UK")
   * @param nominationScope - Where user wants to nominate: 'regional', 'global', 'both', or 'all'
   * @returns Array of database geography values or undefined for no filter
   */
  static mapGeography(
    userInput: string | undefined,
    nominationScope: NominationScope = 'both'
  ): string[] | undefined {
    if (!userInput) {
      // No location provided - return Global only
      return nominationScope === 'regional' ? undefined : ['Global'];
    }
    
    // Normalize input
    const normalized = userInput.toLowerCase().trim();
    
    // Get user's regional geography
    let regionalGeography: string | undefined;
    
    // Try exact match
    if (this.GEOGRAPHY_MAP[normalized]) {
      regionalGeography = this.GEOGRAPHY_MAP[normalized][0];
    } else {
      // Try partial match
      for (const [key, value] of Object.entries(this.GEOGRAPHY_MAP)) {
        if (normalized.includes(key) || key.includes(normalized)) {
          regionalGeography = value[0];
          break;
        }
      }
    }
    
    // Build geography array based on nomination scope
    const geographies: string[] = [];
    
    switch (nominationScope) {
      case 'regional':
        // Only regional categories
        if (regionalGeography) {
          geographies.push(regionalGeography);
        }
        break;
        
      case 'global':
        // Only global categories (IBA)
        geographies.push('Global');
        break;
        
      case 'both':
        // Regional + Global (most common)
        if (regionalGeography) {
          geographies.push(regionalGeography);
        }
        geographies.push('Global');
        break;
        
      case 'all':
        // Everything: Regional + Global + USA
        if (regionalGeography) {
          geographies.push(regionalGeography);
        }
        geographies.push('Global');
        geographies.push('USA');
        break;
    }
    
    return geographies.length > 0 ? geographies : undefined;
  }
  
  /**
   * Get user's regional geography without nomination scope
   * @param userInput - User's location
   * @returns Single regional geography value
   */
  static getRegionalGeography(userInput: string | undefined): string | undefined {
    if (!userInput) {
      return undefined;
    }
    
    const normalized = userInput.toLowerCase().trim();
    
    // Try exact match
    if (this.GEOGRAPHY_MAP[normalized]) {
      return this.GEOGRAPHY_MAP[normalized][0];
    }
    
    // Try partial match
    for (const [key, value] of Object.entries(this.GEOGRAPHY_MAP)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return value[0];
      }
    }
    
    return undefined;
  }
  
  /**
   * Check if a geography value is valid for the database
   */
  static isValidGeography(value: string): boolean {
    const validValues = ['Global', 'USA', 'Asia-Pacific', 'MENA', 'DACH'];
    return validValues.includes(value);
  }
}
