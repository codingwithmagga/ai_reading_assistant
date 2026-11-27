import { useEffect, useState } from "react";
import {
  Box,
  CircularProgress,
  Typography,
  Card,
  CardContent,
  Chip,
  Stack,
} from "@mui/material";
import { TimelineEvent, getBookEvents } from "./api";
import { Copy, getErrorMessage } from "./i18n";
import { ErrorNotice } from "./ErrorNotice";

interface EventsViewProps {
  bookId: string;
  position: number | null;
  copy: Copy;
}

export function EventsView({ bookId, position, copy }: EventsViewProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!bookId || position === null) {
      setEvents([]);
      return;
    }

    let active = true;
    const loadEvents = async () => {
      setLoading(true);
      setError(null);
      try {
        const fetchedEvents = await getBookEvents(bookId, position);
        if (active) {
          setEvents(fetchedEvents);
        }
      } catch (err) {
        if (active) {
          setError(getErrorMessage(err, copy));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    void loadEvents();
    return () => {
      active = false;
    };
  }, [bookId, position, copy]);

  if (!position && position !== 0) {
    return (
      <Box className="notes-panel-empty">
        <Typography color="text.secondary">
          {copy.notesPosition}
        </Typography>
      </Box>
    );
  }

  if (error) {
    return (
      <Box className="notes-panel-error">
        <ErrorNotice
          copy={copy}
          message={error}
          onDismiss={() => setError(null)}
        />
      </Box>
    );
  }

  if (loading) {
    return (
      <Box className="notes-panel-loading" display="flex" justifyContent="center" p={2}>
        <CircularProgress size={32} />
      </Box>
    );
  }

  if (events.length === 0) {
    return (
      <Box className="notes-panel-empty">
        <Typography color="text.secondary">
          {copy.knownEntities || "Noch keine Ereignisse verfügbar"}
        </Typography>
      </Box>
    );
  }

  return (
    <Box className="events-timeline">
      <Typography variant="h6" sx={{ mb: 2 }}>
        {"Was ist bisher passiert?"}
      </Typography>
      <Stack spacing={2}>
        {events.map((event) => (
          <Card
            key={event.id}
            variant="outlined"
            className="event-card"
            sx={{
              borderLeft: "4px solid",
              borderLeftColor: "primary.main",
              position: "relative",
            }}
          >
            <CardContent>
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "start", mb: 1 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                  {event.title}
                </Typography>
                {event.event_type && (
                  <Chip
                    label={event.event_type}
                    size="small"
                    variant="outlined"
                  />
                )}
              </Box>

              <Typography variant="body2" sx={{ mb: 1.5 }}>
                {event.description}
              </Typography>

              {event.entities && event.entities.length > 0 && (
                <Box sx={{ mb: 1 }}>
                  <Typography variant="caption" display="block" sx={{ mb: 0.5 }}>
                    {"Beteiligte:"}
                  </Typography>
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {event.entities.map((entity) => (
                      <Chip
                        key={entity}
                        label={entity}
                        size="small"
                        variant="outlined"
                        sx={{ cursor: "default" }}
                      />
                    ))}
                  </Stack>
                </Box>
              )}

              <Typography variant="caption" color="text.secondary">
                {"Position:"} {event.position}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Box>
  );
}
