// Tablero inicial de Cobra Insights (generado por e2e/armar-reporte.mjs con las herramientas de AG Studio).
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
          "xSpan": 3,
          "ySpan": 3
        },
        "kpi-vencido": {
          "xTrack": 3,
          "yTrack": 0,
          "xSpan": 3,
          "ySpan": 3
        },
        "kpi-cobrado": {
          "xTrack": 6,
          "yTrack": 0,
          "xSpan": 3,
          "ySpan": 3
        },
        "kpi-dias": {
          "xTrack": 9,
          "yTrack": 0,
          "xSpan": 3,
          "ySpan": 3
        },
        "deben": {
          "xTrack": 0,
          "yTrack": 3,
          "xSpan": 7,
          "ySpan": 8
        },
        "estados": {
          "xTrack": 7,
          "yTrack": 11,
          "xSpan": 5,
          "ySpan": 8
        },
        "cobrado-mes": {
          "xTrack": 0,
          "yTrack": 11,
          "xSpan": 7,
          "ySpan": 8
        },
        "demoras": {
          "xTrack": 0,
          "yTrack": 19,
          "xSpan": 12,
          "ySpan": 7
        },
        "marcador": {
          "xTrack": 7,
          "yTrack": 3,
          "xSpan": 5,
          "ySpan": 8
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
