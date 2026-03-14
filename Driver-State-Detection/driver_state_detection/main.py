import time
import pprint
import threading
import asyncio
import websockets
import json
import os

import cv2
import mediapipe as mp
import numpy as np

from attention_scorer import AttentionScorer as AttScorer
from eye_detector import EyeDetector as EyeDet
from parser import get_args
from pose_estimation import HeadPoseEstimator as HeadPoseEst
from utils import get_landmarks, load_camera_parameters

# New MediaPipe Tasks API
BaseOptions = mp.tasks.BaseOptions
FaceLandmarker = mp.tasks.vision.FaceLandmarker
FaceLandmarkerOptions = mp.tasks.vision.FaceLandmarkerOptions
VisionRunningMode = mp.tasks.vision.RunningMode

current_state = {
    "tired": False,
    "asleep": False,
    "looking_away": False,
    "distracted": False,
    "ear": 0.0,
    "perclos": 0.0,
    "gaze": 0.0,
    "roll": 0.0, "pitch": 0.0, "yaw": 0.0,
    "blink_rate": 0
}

async def ws_handler(websocket):
    try:
        while True:
            await websocket.send(json.dumps(current_state))
            await asyncio.sleep(0.1)
    except websockets.exceptions.ConnectionClosed:
        pass

async def ws_server_main():
    async with websockets.serve(ws_handler, "127.0.0.1", 8000):
        print("WebSocket server started on ws://127.0.0.1:8000")
        await asyncio.Future()

def start_ws_server():
    try:
        asyncio.run(ws_server_main())
    except OSError as e:
        print(f"[WS] Failed to start websocket server on 127.0.0.1:8000: {e}")

def main():
    threading.Thread(target=start_ws_server, daemon=True).start()

    args = get_args()

    if not cv2.useOptimized():
        try:
            cv2.setUseOptimized(True)  # set OpenCV optimization to True
        except Exception as e:
            print(
                f"OpenCV optimization could not be set to True, the script may be slower than expected.\nError: {e}"
            )

    if args.camera_params:
        camera_matrix, dist_coeffs = load_camera_parameters(args.camera_params)
    else:
        camera_matrix, dist_coeffs = None, None

    if args.verbose:
        print("Arguments and Parameters used:\n")
        pprint.pp(vars(args), indent=4)
        print("\nCamera Matrix:")
        pprint.pp(camera_matrix, indent=4)
        print("\nDistortion Coefficients:")
        pprint.pp(dist_coeffs, indent=4)
        print("\n")

    # New MediaPipe Tasks API — FaceLandmarker replaces the legacy FaceMesh
    model_path = os.path.join(os.path.dirname(__file__), 'face_landmarker.task')
    options = FaceLandmarkerOptions(
        base_options=BaseOptions(model_asset_path=model_path),
        running_mode=VisionRunningMode.VIDEO,
        num_faces=1,
        min_face_detection_confidence=0.5,
        min_face_presence_confidence=0.5,
        min_tracking_confidence=0.5,
        output_face_blendshapes=False,
        output_facial_transformation_matrixes=False,
    )
    Detector = FaceLandmarker.create_from_options(options)

    # instantiation of the Eye Detector and Head Pose estimator objects
    Eye_det = EyeDet(show_processing=args.show_eye_proc)

    Head_pose = HeadPoseEst(
        show_axis=args.show_axis, camera_matrix=camera_matrix, dist_coeffs=dist_coeffs
    )

    # timing variables
    prev_time = time.perf_counter()
    fps = 0.0  # Initial FPS value

    t_now = time.perf_counter()

    # instantiation of the attention scorer object, with the various thresholds
    # NOTE: set verbose to True for additional printed information about the scores
    Scorer = AttScorer(
        t_now=t_now,
        ear_thresh=args.ear_thresh,
        gaze_time_thresh=args.gaze_time_thresh,
        roll_thresh=args.roll_thresh,
        pitch_thresh=args.pitch_thresh,
        yaw_thresh=args.yaw_thresh,
        ear_time_thresh=args.ear_time_thresh,
        gaze_thresh=args.gaze_thresh,
        pose_time_thresh=args.pose_time_thresh,
        verbose=args.verbose,
    )

    # capture the input from the default system camera (camera number 0)
    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():  # if the camera can't be opened exit the program
        print("Cannot open camera")
        exit()

    # time.sleep(0.01)  # To prevent zero division error when calculating the FPS

    while True:  # infinite loop for webcam video capture
        # get current time in seconds
        t_now = time.perf_counter()

        # Calculate the time taken to process the previous frame
        elapsed_time = t_now - prev_time
        prev_time = t_now

        # calculate FPS
        if elapsed_time > 0:
            fps = np.round(1 / elapsed_time, 3)

        ret, frame = cap.read()  # read a frame from the webcam

        if not ret:  # if a frame can't be read, exit the program
            print("Can't receive frame from camera/stream end")
            break

        # if the frame comes from webcam, flip it so it looks like a mirror.
        if args.camera == 0:
            frame = cv2.flip(frame, 2)

        # start the tick counter for computing the processing time for each frame
        e1 = cv2.getTickCount()

        # get the frame size
        frame_size = frame.shape[1], frame.shape[0]

        # convert BGR to RGB for MediaPipe
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)

        # also prepare grayscale 3-channel for gaze scoring
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        gray = np.expand_dims(gray, axis=2)
        gray = np.concatenate([gray, gray, gray], axis=2)

        # detect face landmarks using the new Tasks API
        timestamp_ms = int(t_now * 1000)
        result = Detector.detect_for_video(mp_image, timestamp_ms)

        if result.face_landmarks:  # process the frame only if at least a face is found
            # convert new API landmarks to numpy array matching old format
            landmarks = get_landmarks(result.face_landmarks)

            # shows the eye keypoints (can be commented)
            Eye_det.show_eye_keypoints(
                color_frame=frame, landmarks=landmarks, frame_size=frame_size
            )

            # compute the EAR score of the eyes
            ear = Eye_det.get_EAR(landmarks=landmarks)

            # compute the *rolling* PERCLOS score and state of tiredness
            # if you don't want to use the rolling PERCLOS, use the get_PERCLOS method instead
            tired, perclos_score = Scorer.get_rolling_PERCLOS(t_now, ear)

            # compute the Gaze Score
            gaze = Eye_det.get_Gaze_Score(
                frame=gray, landmarks=landmarks, frame_size=frame_size
            )

            # compute the head pose
            frame_det, roll, pitch, yaw = Head_pose.get_pose(
                frame=frame, landmarks=landmarks, frame_size=frame_size
            )

            # evaluate the scores for EAR, GAZE and HEAD POSE
            asleep, looking_away, distracted = Scorer.eval_scores(
                t_now=t_now,
                ear_score=ear,
                gaze_score=gaze,
                head_roll=roll,
                head_pitch=pitch,
                head_yaw=yaw,
            )

            current_state.update({
                "tired": bool(tired),
                "asleep": bool(asleep),
                "looking_away": bool(looking_away),
                "distracted": bool(distracted),
                "ear": float(ear) if ear is not None else 0.0,
                "perclos": float(perclos_score) if perclos_score is not None else 0.0,
                "gaze": float(gaze) if gaze is not None else 0.0,
                "roll": float(roll[0]) if roll is not None else 0.0,
                "pitch": float(pitch[0]) if pitch is not None else 0.0,
                "yaw": float(yaw[0]) if yaw is not None else 0.0,
                "blink_rate": int(Scorer.blink_rate)
            })


            # if the head pose estimation is successful, show the results
            if frame_det is not None:
                frame = frame_det

            # show the real-time EAR score
            if ear is not None:
                cv2.putText(
                    frame,
                    "EAR:" + str(round(ear, 3)),
                    (10, 50),
                    cv2.FONT_HERSHEY_PLAIN,
                    2,
                    (255, 255, 255),
                    1,
                    cv2.LINE_AA,
                )

            # show the real-time Gaze Score
            if gaze is not None:
                cv2.putText(
                    frame,
                    "Gaze Score:" + str(round(gaze, 3)),
                    (10, 80),
                    cv2.FONT_HERSHEY_PLAIN,
                    2,
                    (255, 255, 255),
                    1,
                    cv2.LINE_AA,
                )

            # show the real-time PERCLOS score
            cv2.putText(
                frame,
                "PERCLOS:" + str(round(perclos_score, 3)),
                (10, 110),
                cv2.FONT_HERSHEY_PLAIN,
                2,
                (255, 255, 255),
                1,
                cv2.LINE_AA,
            )

            if roll is not None:
                cv2.putText(
                    frame,
                    "roll:" + str(roll.round(1)[0]),
                    (450, 40),
                    cv2.FONT_HERSHEY_PLAIN,
                    1.5,
                    (255, 0, 255),
                    1,
                    cv2.LINE_AA,
                )
            if pitch is not None:
                cv2.putText(
                    frame,
                    "pitch:" + str(pitch.round(1)[0]),
                    (450, 70),
                    cv2.FONT_HERSHEY_PLAIN,
                    1.5,
                    (255, 0, 255),
                    1,
                    cv2.LINE_AA,
                )
            if yaw is not None:
                cv2.putText(
                    frame,
                    "yaw:" + str(yaw.round(1)[0]),
                    (450, 100),
                    cv2.FONT_HERSHEY_PLAIN,
                    1.5,
                    (255, 0, 255),
                    1,
                    cv2.LINE_AA,
                )

            # if the driver is tired, show and alert on screen
            if tired:
                cv2.putText(
                    frame,
                    "TIRED!",
                    (10, 280),
                    cv2.FONT_HERSHEY_PLAIN,
                    1,
                    (0, 0, 255),
                    1,
                    cv2.LINE_AA,
                )

            # if the state of attention of the driver is not normal, show an alert on screen
            if asleep:
                cv2.putText(
                    frame,
                    "ASLEEP!",
                    (10, 300),
                    cv2.FONT_HERSHEY_PLAIN,
                    1,
                    (0, 0, 255),
                    1,
                    cv2.LINE_AA,
                )
            if looking_away:
                cv2.putText(
                    frame,
                    "LOOKING AWAY!",
                    (10, 320),
                    cv2.FONT_HERSHEY_PLAIN,
                    1,
                    (0, 0, 255),
                    1,
                    cv2.LINE_AA,
                )
            if distracted:
                cv2.putText(
                    frame,
                    "DISTRACTED!",
                    (10, 340),
                    cv2.FONT_HERSHEY_PLAIN,
                    1,
                    (0, 0, 255),
                    1,
                    cv2.LINE_AA,
                )

        # stop the tick counter for computing the processing time for each frame
        e2 = cv2.getTickCount()
        # processign time in milliseconds
        proc_time_frame_ms = ((e2 - e1) / cv2.getTickFrequency()) * 1000
        # print fps and processing time per frame on screen
        if args.show_fps:
            cv2.putText(
                frame,
                "FPS:" + str(round(fps)),
                (10, 400),
                cv2.FONT_HERSHEY_PLAIN,
                2,
                (255, 0, 255),
                1,
            )
        if args.show_proc_time:
            cv2.putText(
                frame,
                "PROC. TIME FRAME:" + str(round(proc_time_frame_ms, 0)) + "ms",
                (10, 430),
                cv2.FONT_HERSHEY_PLAIN,
                2,
                (255, 0, 255),
                1,
            )

        if args.debug:
            # show the frame on screen
            cv2.imshow("Driver State Debug", frame)
            # if the key "q" is pressed on the keyboard, the program is terminated
            if cv2.waitKey(20) & 0xFF == ord("q"):
                break

    cap.release()
    cv2.destroyAllWindows()
    Detector.close()

    return


if __name__ == "__main__":
    main()


