// Tablero inicial de Cobra Insights (generado por e2e/armar-reporte.mjs con las herramientas de AG Studio).
// Grilla de 24 columnas: es la que suponen los agentes de AG Studio al ubicar widgets nuevos (con 12, los
// ponían fuera del lienzo).
export const GRILLA = { columns: 24, rowHeight: 20 };
export const REPORTE = {
  "pages": [
    {
      "id": "page-1",
      "widgets": {
        "kpi-pendiente": {
          "type": "value",
          "format": {
            "title": {
              "enabled": true,
              "text": "Outstanding"
            }
          },
          "dataMapping": {
            "value": [
              {
                "id": "invoices.outstanding",
                "aggregation": "sum"
              }
            ]
          }
        },
        "kpi-vencido": {
          "type": "value",
          "format": {
            "title": {
              "enabled": true,
              "text": "Overdue"
            }
          },
          "dataMapping": {
            "value": [
              {
                "id": "invoices.overdue_amount",
                "aggregation": "sum"
              }
            ]
          }
        },
        "kpi-cobrado": {
          "type": "value",
          "format": {
            "title": {
              "enabled": true,
              "text": "Collected"
            }
          },
          "dataMapping": {
            "value": [
              {
                "id": "invoices.collected",
                "aggregation": "sum"
              }
            ]
          }
        },
        "kpi-dias": {
          "type": "value",
          "format": {
            "title": {
              "enabled": true,
              "text": "Avg. days to get paid"
            }
          },
          "dataMapping": {
            "value": [
              {
                "id": "invoices.days_to_pay",
                "aggregation": "avg"
              }
            ]
          }
        },
        "deben": {
          "type": "bar-chart-grouped",
          "format": {
            "title": {
              "enabled": true,
              "text": "Who owes you"
            }
          },
          "dataMapping": {
            "categoryKey": [
              {
                "id": "invoices.client"
              }
            ],
            "valueKey": [
              {
                "id": "invoices.outstanding",
                "aggregation": "sum"
              },
              {
                "id": "invoices.overdue_amount",
                "aggregation": "sum"
              }
            ]
          },
          "sort": [
            {
              "field": {
                "id": "invoices.outstanding",
                "aggregation": "sum"
              },
              "direction": "desc"
            }
          ]
        },
        "estados": {
          "type": "donut-chart",
          "format": {
            "title": {
              "enabled": true,
              "text": "Invoices by status"
            }
          },
          "dataMapping": {
            "categoryKey": [
              {
                "id": "invoices.status"
              }
            ],
            "valueKey": [
              {
                "id": "invoices.amount",
                "aggregation": "sum"
              }
            ]
          }
        },
        "cobrado-mes": {
          "type": "column-chart-grouped",
          "format": {
            "title": {
              "enabled": true,
              "text": "Collected per month"
            }
          },
          "dataMapping": {
            "categoryKey": [
              {
                "id": "invoices.paid_on::month"
              }
            ],
            "valueKey": [
              {
                "id": "invoices.collected",
                "aggregation": "sum"
              }
            ]
          }
        },
        "demoras": {
          "type": "grid",
          "format": {
            "title": {
              "enabled": true,
              "text": "Overdue invoices"
            }
          },
          "dataMapping": {
            "cols": [
              {
                "id": "invoices.invoice"
              },
              {
                "id": "invoices.client"
              },
              {
                "id": "invoices.description"
              },
              {
                "id": "invoices.overdue_amount",
                "aggregation": "sum"
              },
              {
                "id": "invoices.due::day"
              },
              {
                "id": "invoices.days_overdue",
                "aggregation": "max"
              },
              {
                "id": "invoices.reminders_sent",
                "aggregation": "sum"
              }
            ]
          },
          "sort": [
            {
              "field": {
                "id": "invoices.days_overdue",
                "aggregation": "max"
              },
              "direction": "desc"
            }
          ]
        },
        "marcador": {
          "type": "cobra-scoreboard",
          "format": {
            "title": {
              "enabled": true,
              "text": "Collections scoreboard"
            }
          },
          "dataMapping": {
            "client": [
              {
                "id": "invoices.client"
              }
            ],
            "owed": [
              {
                "id": "invoices.outstanding",
                "aggregation": "sum"
              }
            ],
            "days": [
              {
                "id": "invoices.days_overdue",
                "aggregation": "max"
              }
            ]
          }
        }
      },
      "widgetLayout": {
        "kpi-pendiente": {
          "xTrack": 0,
          "yTrack": 0,
          "xSpan": 6,
          "ySpan": 6
        },
        "kpi-vencido": {
          "xTrack": 6,
          "yTrack": 0,
          "xSpan": 6,
          "ySpan": 6
        },
        "kpi-cobrado": {
          "xTrack": 12,
          "yTrack": 0,
          "xSpan": 6,
          "ySpan": 6
        },
        "kpi-dias": {
          "xTrack": 18,
          "yTrack": 0,
          "xSpan": 6,
          "ySpan": 6
        },
        "deben": {
          "xTrack": 0,
          "yTrack": 6,
          "xSpan": 14,
          "ySpan": 16
        },
        "estados": {
          "xTrack": 14,
          "yTrack": 22,
          "xSpan": 10,
          "ySpan": 16
        },
        "cobrado-mes": {
          "xTrack": 0,
          "yTrack": 22,
          "xSpan": 14,
          "ySpan": 16
        },
        "demoras": {
          "xTrack": 0,
          "yTrack": 38,
          "xSpan": 24,
          "ySpan": 14
        },
        "marcador": {
          "xTrack": 14,
          "yTrack": 6,
          "xSpan": 10,
          "ySpan": 16
        }
      },
      "filter": {
        "widget": {
          "cobrado-mes": [
            {
              "field": {
                "id": "invoices.paid_on"
              },
              "model": {
                "operator": "isNotBlank"
              }
            }
          ],
          "demoras": [
            {
              "field": {
                "id": "invoices.overdue_amount"
              },
              "model": {
                "operator": "greaterThan",
                "value": 0
              }
            }
          ]
        }
      }
    }
  ],
  "selectedPageId": "page-1",
  "version": "3.0.0",
  "panels": {
    "filters": {
      "collapsed": true
    },
    "edit": {
      "collapsed": true
    },
    "data": {
      "collapsed": true
    },
    "ai": {
      "width": 360
    }
  }
};
