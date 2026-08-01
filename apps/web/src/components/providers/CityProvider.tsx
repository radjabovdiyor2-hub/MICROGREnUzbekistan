'use client';

import React, { createContext, useContext } from 'react';
import { usePersistentState, STRING_CODEC, type Codec } from '@/lib/persistentState';

type City = 'tashkent' | 'samarkand' | 'bukhara' | 'fergana';

interface CityContextType {
  city: City;
  setCity: (city: City) => void;
  cityName: string;
}

const CityContext = createContext<CityContextType | undefined>(undefined);

export function CityProvider({ children }: { children: React.ReactNode }) {
  const [city, setCity] = usePersistentState<City>('mg_city', 'tashkent', STRING_CODEC as Codec<City>);

  const getCityName = (c: City) => {
    switch (c) {
      case 'tashkent': return 'Toshkent';
      case 'samarkand': return 'Samarqand';
      case 'bukhara': return 'Buxoro';
      case 'fergana': return 'Farg\'ona';
      default: return 'Toshkent';
    }
  };

  return (
    <CityContext.Provider value={{ city, setCity, cityName: getCityName(city) }}>
      {children}
    </CityContext.Provider>
  );
}

export function useCity() {
  const context = useContext(CityContext);
  if (context === undefined) {
    throw new Error('useCity must be used within a CityProvider');
  }
  return context;
}
