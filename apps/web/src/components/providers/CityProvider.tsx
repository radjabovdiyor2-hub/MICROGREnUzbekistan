'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';

type City = 'tashkent' | 'samarkand' | 'bukhara' | 'fergana';

interface CityContextType {
  city: City;
  setCity: (city: City) => void;
  cityName: string;
}

const CityContext = createContext<CityContextType | undefined>(undefined);

export function CityProvider({ children }: { children: React.ReactNode }) {
  const [city, setCityState] = useState<City>('tashkent');

  useEffect(() => {
    const saved = localStorage.getItem('mg_city');
    if (saved) {
      setCityState(saved as City);
    }
  }, []);

  const setCity = (newCity: City) => {
    setCityState(newCity);
    localStorage.setItem('mg_city', newCity);
  };

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
