import mapboxgl from 'mapbox-gl';
import { useCallback, useEffect, useRef, useState } from 'react';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-geocoder/dist/mapbox-gl-geocoder.css';
import bboxTurf from '@turf/bbox';
import 'mapbox-gl/dist/mapbox-gl.css';

import * as GeodesicDraw from 'mapbox-gl-draw-geodesic';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import { Coordinates } from '../map.types';
import { mapMarkerArrowSvgString } from '../mp-marker-string';
import { createPopupsForLineString, renderLineStringPoints, ZOOM_BREAKPOINTS } from './utils';
import { BaseMap, IBaseMapProps } from '../base-map';
import { customDrawStyles } from '../constance';

mapboxgl.accessToken = import.meta.env.VITE_UI_MAPBOX_TOKEN || '';

interface IFeatureMapProps extends Omit<IBaseMapProps, 'mapRef' | 'onMapLoad'> {
    data?: GeoJSON.GeoJSON | null; // only one feature, if you want provide feature collection - develop it
    coordinates?: Coordinates;
    isLineMarkersNeeded?: boolean;
    accessToken?: string;
    centeringCoordinates?: Coordinates;
    animateLineId?: number; // id по которому запускается анимация
    animationDuration?: number;
    isPaused: boolean;
    onAnimationEnd?: () => void;
}

export const TripMap: React.FC<IFeatureMapProps> = ({
    data,
    coordinates,
    centeringCoordinates, // Координаты, по которым происходит центрирование
    isLineMarkersNeeded = true, // Флаг на отображение точек между стартовой и конечной на LineString
    animateLineId,
    isPaused,
    animationDuration = 3000,
    onAnimationEnd,
    ...baseProps
}) => {
    const [animating, setIsAnimating] = useState<number | null>(null);
    const [zoomState, setZoomState] = useState(ZOOM_BREAKPOINTS.MEDIUM);

    const animationPauseRef = useRef<{ frame: number; coordinates: [number, number][] } | boolean | null>(null);
    const arrowRef = useRef<HTMLDivElement>();
    const markersRef = useRef<mapboxgl.Marker[]>([]);
    const map = useRef<mapboxgl.Map>(null);
    const animationMarkerRef = useRef<mapboxgl.Marker | null>(null);
    const drawRef = useRef<MapboxDraw | null>(null);

    const onMapLoad = () => {
        if (!map.current) return;

        arrowRef.current = document.createElement('div');
        arrowRef.current.innerHTML = mapMarkerArrowSvgString;
        arrowRef.current.style.width = '34px';
        arrowRef.current.style.height = '34px';
        arrowRef.current.style.transformOrigin = 'center'; // устанавливаем центр как точку вращения

        // Для работы с источником mapbox-gl-draw-cold
        let modes = MapboxDraw.modes;
        modes = GeodesicDraw.enable(modes);
        const draw = new MapboxDraw({
            displayControlsDefault: false,
            modes: {
                ...modes,
            },
            styles: customDrawStyles,
        });

        drawRef.current = draw;
        map.current.addControl(draw);

        addDataToMap();
    };

    const clearMap = useCallback(() => {
        if (!map.current) return;

        // Удаление всех маркеров
        markersRef.current.forEach((marker) => marker.remove());
        markersRef.current = []; // Очистка массива маркеров после их удаления

        drawRef.current && drawRef.current.deleteAll();
    }, []);

    const addDataToMap = useCallback(() => {
        if (!map.current) return;

        clearMap();

        if (!data) {
            (map.current?.getSource('mapbox-gl-draw-cold') as mapboxgl.GeoJSONSource)?.setData({
                type: 'FeatureCollection',
                features: [],
            });

            return;
        }

        if (data.type === 'FeatureCollection') {
            for (const feature of data.features) {
                const geometry = feature.geometry;

                if (geometry.type === 'LineString') {
                    // Отрисовка маркеров на линии
                    renderLineStringPoints(geometry, map, markersRef, isLineMarkersNeeded);
                }
            }
            (map.current?.getSource('mapbox-gl-draw-cold') as mapboxgl.GeoJSONSource)?.setData({
                type: 'FeatureCollection',
                features: data.features,
            });
        } else {
            (map.current?.getSource('mapbox-gl-draw-cold') as mapboxgl.GeoJSONSource)?.setData(data);
        }

        // bbox logic
        const bbox = bboxTurf(data, { recompute: true });
        const [west, south, east, north] = bbox;
        map.current.fitBounds([west, south, east, north], { padding: 50 });
    }, [data]);

    useEffect(() => {
        if (!map.current) return;

        clearObjects();

        map.current.on('zoom', handleZoomChange);
        map.current.on('move', updatePopups);

        if (map.current.isStyleLoaded()) {
            addDataToMap();
        } else {
            map.current.on('style.load', () => {
                addDataToMap();
            });
        }

        return () => {
            map.current?.off('zoom', handleZoomChange);
            map.current?.off('move', updatePopups);
        };
    }, [data]);

    const animate = (coordinates: [number, number][], frame: number) => {
        const totalFrames = animationDuration / 16; // 60 FPS

        // завершение анимации
        if (frame >= totalFrames) {
            clearObjects();
            return;
        }

        if (animationPauseRef.current === true) {
            animationPauseRef.current = {
                frame,
                coordinates,
            };

            return;
        }

        if (animationPauseRef.current === false) {
            return;
        }

        const progress = frame / totalFrames;
        const pointIndex = Math.floor(progress * (coordinates.length - 1));
        const nextPointIndex = Math.min(pointIndex + 1, coordinates.length - 1);

        const [lng, lat] = coordinates[pointIndex];
        const [nextLng, nextLat] = coordinates[nextPointIndex];

        // Устанавливаем позицию маркера
        animationMarkerRef.current?.setLngLat([lng, lat]);

        // Рассчитываем угол между текущей и следующей точкой
        const angle = Math.atan2(nextLat - lat, nextLng - lng) * (180 / Math.PI) + 210;

        // svg внутри элемента
        const svgElement = arrowRef.current && arrowRef.current.querySelector('svg');

        if (svgElement) {
            svgElement.style.transform = `rotate(-${angle}deg)`;
        }

        frame++;
        requestAnimationFrame(() => animate(coordinates, frame));
    };

    // Функция для запуска анимации
    const startAnimation = useCallback(() => {
        if (!map.current || !data || (animating === animateLineId && animating) || animateLineId == null) return;
        if (data.type === 'FeatureCollection') {
            const lineFeature = data.features.find(
                (feature) => feature.geometry.type === 'LineString' && feature.properties?.lineId === animateLineId,
            );

            if (!lineFeature) {
                console.warn(`No LineString found in data with lineId ${animateLineId} for animation.`);
                setIsAnimating(null);
                return;
            }

            setIsAnimating(animateLineId);

            const coordinates =
                lineFeature.geometry.type === 'LineString'
                    ? (lineFeature.geometry.coordinates as [number, number][])
                    : [];

            // Создаем кастомный HTML-элемент для маркера со стрелкой

            if (animationMarkerRef.current) {
                animationMarkerRef.current.remove();
            }

            // Создаём маркер с кастомной иконкой
            animationMarkerRef.current = new mapboxgl.Marker({ element: arrowRef.current })
                .setLngLat(coordinates[0])
                .addTo(map.current);

            animationPauseRef.current = null;
            animate(coordinates, 0);
        } else {
            console.warn('Data is not a valid FeatureCollection with a LineString for animation.');
        }
    }, [data, animationDuration, animating, isPaused, onAnimationEnd, animateLineId]);

    // Вызов анимации при изменении shouldAnimate
    useEffect(() => {
        if (animateLineId) {
            animationMarkerRef.current?.remove();
            animationPauseRef.current = false;
            startAnimation();
        }
    }, [animateLineId]);

    const updatePopups = useCallback(() => {
        if (!data) {
            createPopupsForLineString();
        }
        const zoom = map.current?.getZoom();

        if (data && data.type === 'FeatureCollection') {
            data.features.forEach((feature) => {
                if (feature.geometry.type === 'LineString') {
                    const { coordinates } = feature.geometry;
                    const { speeds, serverTimes } = feature.properties as {
                        speeds: (number | null)[];
                        serverTimes: (string | null)[];
                    };
                    if (speeds && serverTimes) {
                        createPopupsForLineString(
                            map.current!,
                            coordinates as [number, number][],
                            speeds,
                            serverTimes,
                            zoom,
                        );
                    }
                }
            });
        }
    }, [data]);

    const clearObjects = () => {
        setIsAnimating(null);
        animationMarkerRef.current?.remove();
        animationPauseRef.current = false;
        onAnimationEnd && onAnimationEnd();
    };

    useEffect(() => {
        updatePopups();
    }, [zoomState, data]);

    useEffect(() => {
        if (isPaused) {
            animationPauseRef.current = true;
        } else if (typeof animationPauseRef.current !== 'boolean' && animationPauseRef.current) {
            animate(animationPauseRef.current?.coordinates, animationPauseRef.current?.frame);
        }
    }, [isPaused, data]);

    const handleZoomChange = () => {
        const zoom = map.current?.getZoom();
        if (zoom)
            if (zoom < ZOOM_BREAKPOINTS.NONE) setZoomState(ZOOM_BREAKPOINTS.NONE);
            else if (zoom < ZOOM_BREAKPOINTS.LOW) setZoomState(ZOOM_BREAKPOINTS.LOW);
            else if (zoom < ZOOM_BREAKPOINTS.MEDIUM) setZoomState(ZOOM_BREAKPOINTS.MEDIUM);
            else if (zoom < ZOOM_BREAKPOINTS.HIGH) setZoomState(ZOOM_BREAKPOINTS.HIGH);
    };

    // Центрирование карты по координатам centeringCoordinates
    useEffect(() => {
        if (map.current && centeringCoordinates?.lat && centeringCoordinates?.lon) {
            map.current.flyTo({ center: [centeringCoordinates?.lon, centeringCoordinates?.lat], essential: true });
        }
    }, [centeringCoordinates]);

    return <BaseMap {...baseProps} mapRef={map} onMapLoad={() => onMapLoad()} />;
};