export interface GeoPoint {
  latitude?: number | string;
  longitude?: number | string;
  lat?: number | string;
  lon?: number | string;
  lng?: number | string;
}

export interface AdminCode {
  name: string;
  asciiName: string;
  geoNameId: string;
}

export interface GeoResult {
  geoNameId: string;
  name: string;
  asciiName: string;
  alternateNames: string;
  latitude: number;
  longitude: number;
  featureClass: string;
  featureCode: string;
  countryCode: string;
  admin1Code: AdminCode | string;
  admin2Code: AdminCode | string;
  admin3Code: string;
  admin4Code: string;
  population: number;
  elevation: number | null;
  dem: number;
  timezone: string;
  modificationDate: string;
  distance: number;
}

export type LookUpOneCallback = (err: Error | null, res: GeoResult | null) => void;
export type LookUpCallback = (err: Error | null, res: GeoResult[][]) => void;
