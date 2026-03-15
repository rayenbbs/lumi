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
                "yaw": float(yaw[0]) if yaw is not None else 0.0
            })
