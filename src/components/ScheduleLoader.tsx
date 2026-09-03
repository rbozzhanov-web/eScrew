import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { useAimsSchedule, useAimsApiStatus } from './useAimsSchedule';
import type { NormalizedFlight } from '@/src/core/rosterContract';

interface ScheduleLoaderProps {
  username: string;
  password: string;
  apiBaseUrl?: string;
  startDate: string;
  endDate: string;
  onScheduleLoaded?: () => void;
}

/**
 * Component to load and display AIMS schedule via backend API
 *
 * Usage:
 * ```tsx
 * <ScheduleLoader
 *   username="your_username"
 *   password="your_password"
 *   startDate="2026-09-03"
 *   endDate="2026-09-10"
 * />
 * ```
 */
export function ScheduleLoader({
  username,
  password,
  apiBaseUrl = 'http://localhost:8000',
  startDate,
  endDate,
  onScheduleLoaded
}: ScheduleLoaderProps) {
  const { roster, loading, error, fetchSchedule } = useAimsSchedule({
    username,
    password,
    apiBaseUrl
  });

  const { isHealthy, checkHealth } = useAimsApiStatus(apiBaseUrl);

  useEffect(() => {
    checkHealth();
  }, [apiBaseUrl, checkHealth]);

  useEffect(() => {
    if (isHealthy) {
      fetchSchedule(startDate, endDate).then(() => {
        onScheduleLoaded?.();
      });
    }
  }, [isHealthy, startDate, endDate, fetchSchedule, onScheduleLoaded]);

  // API not available
  if (!isHealthy && !loading && !roster) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTitle}>Parser API Unavailable</Text>
        <Text style={styles.errorText}>
          Make sure the backend parser is running:
        </Text>
        <Text style={styles.code}>docker-compose up -d</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => checkHealth()}
        >
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Loading state
  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#0066cc" />
        <Text style={styles.loadingText}>Fetching schedule...</Text>
      </View>
    );
  }

  // Error state
  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorTitle}>Error Loading Schedule</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity
          style={styles.button}
          onPress={() => fetchSchedule(startDate, endDate)}
        >
          <Text style={styles.buttonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Success state
  if (!roster) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>No schedule data</Text>
      </View>
    );
  }

  const allFlights = roster.duties.flatMap((duty) => duty.flights);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Your Schedule</Text>
        <Text style={styles.subtitle}>
          {startDate} - {endDate}
        </Text>
      </View>

      {allFlights.map((flight, index) => (
        <FlightCard key={`${flight.date}-${flight.flightNumber}-${index}`} flight={flight} />
      ))}

      {allFlights.length === 0 && (
        <Text style={styles.emptyText}>No flights scheduled</Text>
      )}
    </ScrollView>
  );
}

function FlightCard({ flight }: { flight: NormalizedFlight }) {
  return (
    <View style={styles.flightCard}>
      <View style={styles.flightHeader}>
        <Text style={styles.flightNumber}>{flight.flightNumber}</Text>
        <Text style={styles.flightDate}>{flight.date}</Text>
      </View>

      <View style={styles.flightInfo}>
        <View style={styles.route}>
          <Text style={styles.airport}>{flight.origin}</Text>
          <Text style={styles.arrow}>→</Text>
          <Text style={styles.airport}>{flight.destination}</Text>
        </View>

        <View style={styles.times}>
          <Text style={styles.time}>Depart: {flight.departure}</Text>
          <Text style={styles.time}>Arrive: {flight.arrival}</Text>
        </View>

        {flight.aircraftType && (
          <Text style={styles.aircraft}>{flight.aircraftType}</Text>
        )}
      </View>

      {flight.crew && flight.crew.length > 0 && (
        <View style={styles.crew}>
          <Text style={styles.crewTitle}>Crew:</Text>
          {flight.crew.map((member, idx) => (
            <Text key={idx} style={styles.crewMember}>
              • {member.name} ({member.position})
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#f5f5f5'
  },
  header: {
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd'
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 4
  },
  subtitle: {
    fontSize: 14,
    color: '#666'
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
    textAlign: 'center'
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#d32f2f',
    marginBottom: 8
  },
  errorText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 16,
    lineHeight: 20
  },
  code: {
    fontSize: 12,
    fontFamily: 'monospace',
    backgroundColor: '#f0f0f0',
    padding: 8,
    borderRadius: 4,
    marginBottom: 16,
    color: '#333'
  },
  button: {
    backgroundColor: '#0066cc',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 6,
    alignItems: 'center'
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold'
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#999',
    marginTop: 32
  },
  flightCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#0066cc',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.41,
    elevation: 2
  },
  flightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  flightNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333'
  },
  flightDate: {
    fontSize: 14,
    color: '#666'
  },
  flightInfo: {
    marginBottom: 12
  },
  route: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  airport: {
    fontSize: 16,
    fontWeight: '600',
    color: '#0066cc'
  },
  arrow: {
    fontSize: 14,
    color: '#999'
  },
  times: {
    marginTop: 8
  },
  time: {
    fontSize: 13,
    color: '#666',
    marginVertical: 2
  },
  aircraft: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
    fontStyle: 'italic'
  },
  crew: {
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 8
  },
  crewTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 6
  },
  crewMember: {
    fontSize: 12,
    color: '#666',
    marginLeft: 8,
    marginVertical: 2
  }
});
