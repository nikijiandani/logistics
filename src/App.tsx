import React, { useState, useEffect, Context, createContext } from 'react';
import './App.css';
import Calendar from './ui/component/Calendar';
import DriverTaskService, {
  ConflictServiceError,
} from './domain/service/DriverTaskService';
import DriverTaskFactory from './domain/factory/DriverTaskFactory';
import IdGenerator from './domain/gen/IdGenerator';
import { DriverTaskRepository } from './domain/repository/DriverTaskRepository';
import User from './domain/model/User';
import { UserType } from './domain/type/UserType';
import Overlay from './ui/component/Overlay';
import EditDriverTask from './ui/section/EditDriverTask';
import { DriverTaskInput } from './domain/input/DriverTaskInput';
import DriverTask from './domain/model/DriverTask';
import ServiceError, { ServiceErrorType } from './domain/service/ServiceError';
import DriverTaskValidator from './domain/validator/DriverTaskValidator';
import Notification from './ui/component/Notification';
import Button from './ui/component/Button';
import Confirm from './ui/section/Confirm';
import { getNumberInputFromString } from './util/input_util';
import TaskConflict from './ui/section/TaskConflict';

const driverTaskRepo: DriverTaskRepository = new DriverTaskRepository();
const driverTaskService: DriverTaskService = new DriverTaskService(
  new DriverTaskFactory(new IdGenerator()),
  driverTaskRepo,
  new DriverTaskValidator(driverTaskRepo),
);

const driverUsers = [
  new User(2, UserType.DRIVER, 'John Smith'),
  new User(3, UserType.DRIVER, 'Fierce Bob'),
  new User(4, UserType.DRIVER, 'Jane Doe'),
];

function getClampedWeek(week: number) {
  return ((((week - 1) % 52) + 52) % 52) + 1;
}

type AppContextType = {
  displayNotification: Function;
  openOverlay: Function;
  closeOverlay: Function;
  performTaskEdit: Function;
};

export const AppContext: Context<AppContextType> = createContext(
  {} as AppContextType,
);

function App() {
  const [loggedInUser] = useState(new User(1, UserType.DISPATCHER));
  const [selectedUserID, setSelectedUserID] = useState(
    driverUsers?.[0].id || 1,
  );
  const [selectedWeek, setSelectedWeek] = useState(1);
  const [tasks, setTasks] = useState<DriverTask[]>([]);
  const [notifications, setNotifications] = useState<string[]>([]);
  const [currOverlay, setCurrOverlay] = useState<JSX.Element | null>(null);
  const [currOverlayMenuItems, setCurrOverlayMenuItems] = useState<
    JSX.Element[]
  >([]);

  const addTaskElem = (
    <EditDriverTask
      userID={selectedUserID}
      label="Add New Task"
      submitFunc={addNewTask}
      defaultWeek={selectedWeek}
    />
  );

  useEffect(() => {
    driverTaskService
      .getWeeklyUserTasks(selectedUserID, selectedWeek, loggedInUser)
      .then((res: DriverTask[]) => {
        setTasks(res);
      })
      .catch((err: ServiceError) => {
        console.log(err.message);
      });
  }, [selectedUserID, selectedWeek, loggedInUser]);

  function reloadTasks() {
    driverTaskService
      .getWeeklyUserTasks(selectedUserID, selectedWeek, loggedInUser)
      .then((res: DriverTask[]) => {
        setTasks(res);
      })
      .catch((err: ServiceError) => {
        console.log(err.message);
      });
  }

  function displayNotification(message: string) {
    setNotifications((notifications) => [...notifications, message]);
    const timeout = setTimeout(() => {
      setNotifications((notifications) => {
        let offset = notifications.indexOf(message);
        return notifications
          .slice(0, offset)
          .concat(notifications.slice(offset + 1));
      });
      clearTimeout(timeout);
    }, 2000);
  }

  function openOverlay(
    overlayElem: JSX.Element,
    contextMenuItems: JSX.Element[] = [],
  ) {
    setCurrOverlay(overlayElem);
    setCurrOverlayMenuItems(contextMenuItems);
  }

  function closeOverlay() {
    setCurrOverlay(null);
    setCurrOverlayMenuItems([]);
  }

  function performTaskEdit(driverTask: DriverTask) {
    openOverlay(
      <EditDriverTask
        userID={selectedUserID}
        defaultType={driverTask.type}
        defaultStart={driverTask.start}
        defaultEnd={driverTask.end}
        defaultLocation={driverTask.location}
        defaultDay={driverTask.day}
        defaultWeek={driverTask.week}
        label="Edit Task"
        submitFunc={(args: DriverTaskInput) => updateTask(driverTask.id, args)}
      />,
      [
        <Button
          onClick={() => {
            openOverlay(
              <Confirm
                label="Are you sure you want to delete this task? It cannot be undone."
                yesFunc={() => deleteTask(driverTask.id)}
                noFunc={() => performTaskEdit(driverTask)}
              ></Confirm>,
            );
          }}
          label="Delete"
        ></Button>,
      ],
    );
  }

  function addNewTask(args: DriverTaskInput) {
    driverTaskService
      .addTask(args, loggedInUser)
      .then((task) => {
        displayNotification('Adding successful');
        reloadTasks();
      })
      .catch((err: ServiceError) => {
        displayNotification(err.message);
        if (err.type === ServiceErrorType.TASK_CONFLICT) {
          openOverlay(
            <TaskConflict
              retryTask={() => addNewTask(args)}
              deleteTask={deleteTask}
              conflictingTasks={(err as ConflictServiceError).conflictingTasks}
            />,
          );
        }
      });
    closeOverlay();
  }

  function updateTask(driverTaskID: number, args: DriverTaskInput) {
    driverTaskService
      .updateTask(driverTaskID, args, loggedInUser)
      .then((res) => {
        displayNotification('Updating successful');
        reloadTasks();
      })
      .catch((err) => {
        displayNotification(err.message);
        if (err.type === ServiceErrorType.TASK_CONFLICT) {
          openOverlay(
            <TaskConflict
              retryTask={() => updateTask(driverTaskID, args)}
              deleteTask={deleteTask}
              conflictingTasks={(err as ConflictServiceError).conflictingTasks}
            />,
          );
        }
      });
    closeOverlay();
  }

  function deleteTask(
    driverTaskId: number,
    shouldOverlayClose: boolean = true,
  ) {
    driverTaskService
      .deleteTask(driverTaskId, loggedInUser)
      .then((res) => {
        displayNotification('Deleting successful');
        reloadTasks();
      })
      .catch((err) => {
        displayNotification(err.message);
      });
    if (shouldOverlayClose) closeOverlay();
  }

  function populateDriverOptions() {
    return (
      <>
        {driverUsers.map((user, i) => (
          <option key={`driver_option_${i}`} value={user.id}>
            {user.name}
          </option>
        ))}
      </>
    );
  }

  return (
    <div className="App">
      {(() => {
        if (currOverlay) {
          return (
            <div
              style={{
                position: 'fixed',
                width: '100vw',
                height: '100vh',
                backgroundColor: 'black',
                opacity: '0.4',
                zIndex: 499,
              }}
            ></div>
          );
        }
      })()}
      <header className="App-header">
        <h1
          style={{
            color: 'lightgrey',
          }}
        >
          logistics
        </h1>
      </header>
      <div
        style={{
          display: 'flex',
        }}
      >
        <Button
          onClick={() => openOverlay(addTaskElem)}
          label="Create"
        ></Button>
        <Button label="Download"></Button>
      </div>
      <div
        style={{
          display: 'flex',
          padding: '8px',
        }}
      >
        <div
          style={{
            padding: '0 8px',
          }}
        >
          <span
            style={{
              padding: '0 8px',
            }}
          >
            Driver
          </span>
          <select
            onChange={(e) =>
              setSelectedUserID(getNumberInputFromString(e.target.value))
            }
          >
            {populateDriverOptions()}
          </select>
        </div>
        <div
          style={{
            padding: '0 8px',
            flex: 2,
          }}
        >
          <Button
            onClick={() => setSelectedWeek(getClampedWeek(selectedWeek - 1))}
            label="<-"
          />
          <span>{` Week ${selectedWeek} `}</span>
          <Button
            onClick={() => setSelectedWeek(getClampedWeek(selectedWeek + 1))}
            label="->"
          />
        </div>
      </div>
      <AppContext.Provider
        value={{
          displayNotification,
          openOverlay,
          closeOverlay,
          performTaskEdit,
        }}
      >
        <Calendar tasks={tasks} />
        <div
          style={{
            position: 'absolute',
            margin: '0 auto',
          }}
        >
          {(() => {
            if (currOverlay) {
              return (
                <Overlay
                  contextMenuItems={currOverlayMenuItems}
                  container={currOverlay}
                />
              );
            }
          })()}
          {notifications.map((notification, i) => (
            <Notification
              key={`notif_${i}`}
              notificationIndex={i}
              message={notification}
            />
          ))}
        </div>
      </AppContext.Provider>
    </div>
  );
}

export default App;
