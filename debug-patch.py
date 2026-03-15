            if args.debug:
                cv2.putText(frame, f"EAR: {state['ear']:.2f}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                cv2.putText(frame, f"GAZE: {state['gaze']:.2f}", (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                cv2.putText(frame, f"PERCLOS: {state['perclos']:.2f}", (10, 90), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                cv2.putText(frame, f"ROLL: {state['roll']:.1f} PITCH: {state['pitch']:.1f} YAW: {state['yaw']:.1f}", (10, 120), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 0), 2)

                y_offset = 160
                def put_alert(text):
                    nonlocal y_offset
                    cv2.putText(frame, text, (10, y_offset), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
                    y_offset += 30

                if state['asleep']: put_alert("ASLEEP")
                if state['tired']: put_alert("TIRED")
                if state['distracted']: put_alert("DISTRACTED")
                if state['looking_away']: put_alert("LOOKING AWAY")

                cv2.imshow("Driver State Debug", frame)
                cv2.waitKey(1)

            await websocket.send_json(state)
